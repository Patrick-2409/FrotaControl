const ROCHA_TIPOS = ["rocha", "rocha_pulmao", "rocha_armacao"];
const MATERIAL_TIPOS = ["esteril", ...ROCHA_TIPOS];

const HAS_MATERIAL_CAPACITY_SQL = `(
  v.capacidade_esteril_ton IS NOT NULL
  OR v.capacidade_rocha_ton IS NOT NULL
  OR v.capacidade_rocha_pulmao_ton IS NOT NULL
  OR v.capacidade_rocha_armacao_ton IS NOT NULL
)`;

const MATERIAL_ALLOWED_SQL = {
  esteril: `COALESCE(
    v.transporta_esteril,
    CASE
      WHEN ${HAS_MATERIAL_CAPACITY_SQL} THEN v.capacidade_esteril_ton IS NOT NULL
      ELSE COALESCE(v.capacidade_ton, 0) > 0
    END
  )`,
  rocha_pulmao: `COALESCE(
    v.transporta_rocha_pulmao,
    v.transporta_rocha,
    CASE
      WHEN ${HAS_MATERIAL_CAPACITY_SQL}
        THEN COALESCE(v.capacidade_rocha_pulmao_ton, v.capacidade_rocha_ton) IS NOT NULL
      ELSE COALESCE(v.capacidade_ton, 0) > 0
    END
  )`,
  rocha_armacao: `COALESCE(
    v.transporta_rocha_armacao,
    v.transporta_rocha,
    CASE
      WHEN ${HAS_MATERIAL_CAPACITY_SQL}
        THEN COALESCE(v.capacidade_rocha_armacao_ton, v.capacidade_rocha_ton) IS NOT NULL
      ELSE COALESCE(v.capacidade_ton, 0) > 0
    END
  )`,
};

MATERIAL_ALLOWED_SQL.rocha = `COALESCE(
  v.transporta_rocha,
  (${MATERIAL_ALLOWED_SQL.rocha_pulmao}) OR (${MATERIAL_ALLOWED_SQL.rocha_armacao})
)`;

const MATERIAL_CAPACITY_SQL = {
  esteril: `CASE
    WHEN ${MATERIAL_ALLOWED_SQL.esteril} THEN
      CASE
        WHEN ${HAS_MATERIAL_CAPACITY_SQL} THEN COALESCE(v.capacidade_esteril_ton, 0)
        ELSE COALESCE(v.capacidade_ton, 0)
      END
    ELSE 0
  END`,
  rocha_pulmao: `CASE
    WHEN ${MATERIAL_ALLOWED_SQL.rocha_pulmao} THEN
      CASE
        WHEN ${HAS_MATERIAL_CAPACITY_SQL}
          THEN COALESCE(v.capacidade_rocha_pulmao_ton, v.capacidade_rocha_ton, 0)
        ELSE COALESCE(v.capacidade_ton, 0)
      END
    ELSE 0
  END`,
  rocha_armacao: `CASE
    WHEN ${MATERIAL_ALLOWED_SQL.rocha_armacao} THEN
      CASE
        WHEN ${HAS_MATERIAL_CAPACITY_SQL}
          THEN COALESCE(v.capacidade_rocha_armacao_ton, v.capacidade_rocha_ton, 0)
        ELSE COALESCE(v.capacidade_ton, 0)
      END
    ELSE 0
  END`,
};

MATERIAL_CAPACITY_SQL.rocha = `CASE
  WHEN ${MATERIAL_ALLOWED_SQL.rocha} THEN
    CASE
      WHEN ${HAS_MATERIAL_CAPACITY_SQL}
        THEN COALESCE(v.capacidade_rocha_ton, v.capacidade_rocha_pulmao_ton, v.capacidade_rocha_armacao_ton, 0)
      ELSE COALESCE(v.capacidade_ton, 0)
    END
  ELSE 0
END`;

const ROCHA_TIPOS_SQL = "'rocha', 'rocha_pulmao', 'rocha_armacao'";

const rochaTotalTonSql = (tipoExpr = "vi.tipo") => `CASE
  WHEN ${tipoExpr} = 'rocha_pulmao' THEN ${MATERIAL_CAPACITY_SQL.rocha_pulmao}
  WHEN ${tipoExpr} = 'rocha_armacao' THEN ${MATERIAL_CAPACITY_SQL.rocha_armacao}
  WHEN ${tipoExpr} = 'rocha' THEN ${MATERIAL_CAPACITY_SQL.rocha}
  ELSE 0
END`;

module.exports = {
  HAS_MATERIAL_CAPACITY_SQL,
  MATERIAL_ALLOWED_SQL,
  MATERIAL_CAPACITY_SQL,
  MATERIAL_TIPOS,
  ROCHA_TIPOS,
  ROCHA_TIPOS_SQL,
  rochaTotalTonSql,
};
