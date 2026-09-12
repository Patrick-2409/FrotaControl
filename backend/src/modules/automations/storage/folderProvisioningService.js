"use strict";

/**
 * Provisionamento idempotente da árvore de pastas de uma execução:
 *   <pasta_raiz_da_config>/Diários de Obra/<ano>/<mês>/<dia>/Fotos
 *
 * Estratégia de idempotência (Bloco 4, seção 13):
 *   1. Fast path SEM lock: se todos os IDs já estão persistidos
 *      (automacao_configs.google_drive_pasta_diarios_id +
 *      automacao_execucoes.drive_folder_{ano,mes,dia,fotos}_id), retorna
 *      direto — nenhuma chamada ao Drive, nenhum lock.
 *   2. Caso falte algum nível, serializa por `automacao_config_id` com
 *      `pg_advisory_xact_lock` (liberado automaticamente no COMMIT/ROLLBACK
 *      da transação) — "Diários de Obra" e a pasta do ANO são compartilhados
 *      entre TODAS as execuções (dias) da mesma config, então o lock precisa
 *      cobrir a config inteira, não só a execução atual, para nunca criar
 *      pasta duplicada quando duas execuções de dias diferentes da mesma
 *      config provisionam ao mesmo tempo.
 *   3. Dentro do lock, os dados são relidos (mesma transação) — um segundo
 *      processo que esperou o lock enxerga o que o primeiro já persistiu e
 *      pula direto para o próximo nível que falta, sem duplicar.
 *   4. Cada nível criado é persistido IMEDIATAMENTE, não só ao final — uma
 *      falha no meio da cadeia (ex.: Drive cai na criação do "mês") nunca
 *      perde os níveis já criados.
 *
 * Pastas usam busca-por-NOME (via `driveClient.ensureFolder`) como mecanismo
 * de recuperação, não appProperties — ao contrário dos arquivos de foto
 * (ver photoStorageService.js), o nome de uma pasta é determinístico e único
 * dentro do pai (nunca dois "2026" na mesma "Diários de Obra"), então
 * nome-dentro-do-pai já é uma chave de busca confiável.
 */

const { StorageError } = require("./errorClassification");
const { DIARIOS_DE_OBRA_FOLDER_NAME, PHOTOS_FOLDER_NAME, yearFolderName, monthFolderName, dayFolderName } = require("./folderNaming");

async function loadConfigFolderState(client, automacaoConfigId) {
  const { rows } = await client.query(
    `SELECT id, google_drive_pasta_raiz_id, google_drive_pasta_diarios_id FROM automacao_configs WHERE id = $1`,
    [automacaoConfigId]
  );
  return rows[0] || null;
}

async function loadExecucaoFolderState(client, execucaoId) {
  const { rows } = await client.query(
    `SELECT id, automacao_config_id, drive_folder_ano_id, drive_folder_mes_id, drive_folder_dia_id, drive_folder_fotos_id,
            to_char(data_referencia, 'YYYY-MM-DD') AS data_referencia
     FROM automacao_execucoes WHERE id = $1`,
    [execucaoId]
  );
  return rows[0] || null;
}

function isFullyProvisioned(execucaoRow) {
  return Boolean(
    execucaoRow.drive_folder_ano_id &&
      execucaoRow.drive_folder_mes_id &&
      execucaoRow.drive_folder_dia_id &&
      execucaoRow.drive_folder_fotos_id
  );
}

function requireRootFolder(config) {
  if (!config.google_drive_pasta_raiz_id) {
    const err = new StorageError(
      `Config ${config.id} não tem google_drive_pasta_raiz_id configurado — impossível provisionar pastas no Drive.`,
      { code: "CONFIGURACAO_INCOMPLETA", storageErrorClass: "DEFINITIVE" }
    );
    throw err;
  }
  return config.google_drive_pasta_raiz_id;
}

async function ensureExecutionFolders({ pool, execucaoId, driveClient }) {
  const fastCheck = await loadExecucaoFolderState(pool, execucaoId);
  if (!fastCheck) {
    throw new StorageError(`Execução ${execucaoId} não encontrada.`, {
      code: "EXECUCAO_NAO_ENCONTRADA",
      storageErrorClass: "DEFINITIVE",
    });
  }
  if (isFullyProvisioned(fastCheck)) {
    return {
      anoId: fastCheck.drive_folder_ano_id,
      mesId: fastCheck.drive_folder_mes_id,
      diaId: fastCheck.drive_folder_dia_id,
      fotosId: fastCheck.drive_folder_fotos_id,
      anyCreated: false,
      createdLevels: [],
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `automacao_config_folders:${fastCheck.automacao_config_id}`,
    ]);

    const execucao = await loadExecucaoFolderState(client, execucaoId);
    const config = await loadConfigFolderState(client, execucao.automacao_config_id);
    if (!config) {
      throw new StorageError(`Config ${execucao.automacao_config_id} não encontrada.`, {
        code: "CONFIGURACAO_INCOMPLETA",
        storageErrorClass: "DEFINITIVE",
      });
    }
    const rootId = requireRootFolder(config);
    const createdLevels = [];

    let diariosId = config.google_drive_pasta_diarios_id;
    if (!diariosId) {
      const folder = await driveClient.ensureFolder({
        parentId: rootId,
        name: DIARIOS_DE_OBRA_FOLDER_NAME,
        appProperties: { automacao_config_id: String(config.id), nivel: "diarios_de_obra" },
      });
      diariosId = folder.id;
      if (folder.wasCreated) createdLevels.push("diarios_de_obra");
      await client.query(
        `UPDATE automacao_configs SET google_drive_pasta_diarios_id = $1, updated_at = NOW() WHERE id = $2`,
        [diariosId, config.id]
      );
    }

    let anoId = execucao.drive_folder_ano_id;
    if (!anoId) {
      const folder = await driveClient.ensureFolder({
        parentId: diariosId,
        name: yearFolderName(execucao.data_referencia),
        appProperties: { automacao_config_id: String(config.id), nivel: "ano" },
      });
      anoId = folder.id;
      if (folder.wasCreated) createdLevels.push("ano");
      await client.query(`UPDATE automacao_execucoes SET drive_folder_ano_id = $1, updated_at = NOW() WHERE id = $2`, [
        anoId,
        execucaoId,
      ]);
    }

    let mesId = execucao.drive_folder_mes_id;
    if (!mesId) {
      const folder = await driveClient.ensureFolder({
        parentId: anoId,
        name: monthFolderName(execucao.data_referencia),
        appProperties: { automacao_config_id: String(config.id), nivel: "mes" },
      });
      mesId = folder.id;
      if (folder.wasCreated) createdLevels.push("mes");
      await client.query(`UPDATE automacao_execucoes SET drive_folder_mes_id = $1, updated_at = NOW() WHERE id = $2`, [
        mesId,
        execucaoId,
      ]);
    }

    let diaId = execucao.drive_folder_dia_id;
    if (!diaId) {
      const folder = await driveClient.ensureFolder({
        parentId: mesId,
        name: dayFolderName(execucao.data_referencia),
        appProperties: { automacao_execucao_id: String(execucaoId), nivel: "dia" },
      });
      diaId = folder.id;
      if (folder.wasCreated) createdLevels.push("dia");
      await client.query(`UPDATE automacao_execucoes SET drive_folder_dia_id = $1, updated_at = NOW() WHERE id = $2`, [
        diaId,
        execucaoId,
      ]);
    }

    let fotosId = execucao.drive_folder_fotos_id;
    if (!fotosId) {
      const folder = await driveClient.ensureFolder({
        parentId: diaId,
        name: PHOTOS_FOLDER_NAME,
        appProperties: { automacao_execucao_id: String(execucaoId), nivel: "fotos" },
      });
      fotosId = folder.id;
      if (folder.wasCreated) createdLevels.push("fotos");
      await client.query(`UPDATE automacao_execucoes SET drive_folder_fotos_id = $1, updated_at = NOW() WHERE id = $2`, [
        fotosId,
        execucaoId,
      ]);
    }

    await client.query("COMMIT");
    return { anoId, mesId, diaId, fotosId, anyCreated: createdLevels.length > 0, createdLevels };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ensureExecutionFolders };
