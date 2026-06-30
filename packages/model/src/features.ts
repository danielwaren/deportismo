// -----------------------------------------------------------------------------
// FEATURE STORE para los modelos ML (#ML).
//
// Convierte el estado de un partido (Elo multi-componente + contexto) en un
// VECTOR de features nombradas, que consumen los modelos enchufables (regresión
// logística hoy; XGBoost/LightGBM mañana). Mantener FEATURE_NAMES sincronizado
// con el orden del vector — los pesos entrenados dependen de ese orden.
// -----------------------------------------------------------------------------

export const FEATURE_NAMES = [
  'elo_general',     // (homeGeneral - awayGeneral) / 100
  'matchup_home',    // (homeOff - awayDef) / 100   ataque local vs defensa visita
  'matchup_away',    // (awayOff - homeDef) / 100   ataque visita vs defensa local
  'home_adv',        // ventaja de localía (Elo) / 100
  'form_diff',       // formHome - formAway  [-2, 2]
  'rest_adv',        // ventaja de descanso  [-1, 1]
] as const;

export interface MatchFeatureInput {
  homeGeneral: number;
  awayGeneral: number;
  homeOff: number;
  homeDef: number;
  awayOff: number;
  awayDef: number;
  homeAdvElo: number;
  formHome?: number;
  formAway?: number;
  restAdv?: number;
}

/** Vector de features en el orden de FEATURE_NAMES. Escala ~unitaria. */
export function extractFeatures(i: MatchFeatureInput): number[] {
  return [
    (i.homeGeneral - i.awayGeneral) / 100,
    (i.homeOff - i.awayDef) / 100,
    (i.awayOff - i.homeDef) / 100,
    i.homeAdvElo / 100,
    (i.formHome ?? 0) - (i.formAway ?? 0),
    i.restAdv ?? 0,
  ];
}
