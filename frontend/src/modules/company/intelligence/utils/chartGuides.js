export const CHART_GUIDES = {
  consumoPorVeiculo: {
    titulo: "Consumo por veículo",
    oQue: "Distribuição percentual do consumo de combustível entre os veículos do escopo filtrado.",
    como: "Fatias maiores indicam concentração de gasto. Compare com a produção do mesmo veículo.",
    impacto: "Dependência de um único ativo aumenta risco operacional e dificulta controle de custo.",
  },
  custoPorPeriodo: {
    titulo: "Custo ao longo do tempo",
    oQue: "Evolução diária do custo de abastecimento com base em lançamentos reais.",
    como: "Picos isolados exigem validação de lançamento ou demanda extraordinária. Tendência de alta sem produção é sinal de alerta.",
    impacto: "Custos crescentes sem aumento de produção reduzem margem e indicam possível erro de dado.",
  },
  consumoVsProducao: {
    titulo: "Consumo vs produção (transporte)",
    oQue: "Comparativo diário entre litros consumidos e viagens registradas — apenas veículos de transporte.",
    como: "Barras desalinhadas (consumo sem produção ou vice-versa) sugerem ERRO DE DADO ou falha de integração.",
    impacto: "Indicadores de eficiência ficam inválidos enquanto consumo e produção não estiverem coerentes.",
  },
  parteDiariaProdutividade: {
    titulo: "Produtividade — parte diária",
    oQue: "Volume diário de registros de parte diária e horas operacionais lançadas.",
    como: "Queda abrupta indica subutilização da frota de apoio ou falha de lançamento pelos operadores.",
    impacto: "Baixa cobertura de parte diária impede leitura confiável de uso e produtividade operacional.",
  },
};
