// -----------------------------------------------------------------------------
// LAMBDAS PRINCIPISTAS (Fase 1).
//
// Antes las lambdas (goles esperados que alimentan Dixon-Coles) salían SOLO del
// Elo global (eloToLambdas). Eso es pobre: no separa ataque/defensa ni admite
// forma, descanso o lesiones. Aquí se construyen multiplicativamente, al estilo
// de los modelos de fuerza ataque/defensa:
//
//   lambdaLocal  = mediaGolesLiga · ataqueLocal · defensaVisita · localía
//                  · forma · descanso · lesiones
//   lambdaVisita = mediaGolesLiga · ataqueVisita · defensaLocal · (1/localía parcial)
//                  · forma · descanso · lesiones
//
// Cada factor es un multiplicador alrededor de 1.0 y SE EXPLICA (Explanation):
// el panel "por qué" puede listar "+8% ataque local, -5% lesiones, ...".
//
// eloToLambdas (en ensemble.ts) se conserva como FALLBACK de cold-start cuando
// no hay fuerzas ataque/defensa fiables (selecciones sin media de liga limpia).
// -----------------------------------------------------------------------------

import { type Explanation, emptyExplanation, addFactor, multFactor } from './explain';

export interface LambdaSensitivity {
  /** cuánto mueve la forma [-1,1] a la lambda (mult = e^{form·k}). */
  form: number;
  /** cuánto mueve la ventaja de descanso [-1,1]. */
  rest: number;
  /** cuánto restan las lesiones [0,1] (mult = e^{-sev·k}). */
  injuries: number;
}

export const DEFAULT_SENSITIVITY: LambdaSensitivity = {
  form: 0.18, // forma máxima (+1) -> ~+20% goles
  rest: 0.1, // ventaja de descanso máxima -> ~+10%
  injuries: 0.25, // perder al núcleo (sev=1) -> ~-22% goles
};

export interface LambdaInputs {
  /** media de goles por equipo y partido en la liga (p.ej. 1.35). */
  leagueAvgGoals: number;
  /** fuerzas multiplicativas (1.0 = media de liga). Ver elo.eloToAttackStrength. */
  homeAttack: number;
  awayDefense: number; // <1 = visita defiende bien (local marca menos)
  awayAttack: number;
  homeDefense: number;
  /** multiplicador de localía aplicado al ataque local (p.ej. 1.10). */
  homeAdvantage?: number;
  /** factores contextuales opcionales. Si faltan, no afectan (mult = 1). */
  formHome?: number; // [-1, 1]
  formAway?: number;
  restAdvantage?: number; // [-1, 1] a favor del local
  injuriesHome?: number; // [0, 1] severidad
  injuriesAway?: number;
  sensitivity?: Partial<LambdaSensitivity>;
}

export interface LambdaResult {
  lambdaHome: number;
  lambdaAway: number;
  explanation: Explanation;
}

/**
 * Construye las lambdas local/visita de forma multiplicativa y explicada.
 * Todas las funciones son puras; los valores por defecto hacen que los factores
 * ausentes no alteren el resultado (graceful: el modelo funciona sin contexto).
 */
export function computeLambdas(i: LambdaInputs): LambdaResult {
  const s = { ...DEFAULT_SENSITIVITY, ...i.sensitivity };
  const expl = emptyExplanation();
  const ha = i.homeAdvantage ?? 1;

  // --- base ataque × defensa rival × media liga ---
  let lambdaHome = i.leagueAvgGoals * i.homeAttack * i.awayDefense;
  let lambdaAway = i.leagueAvgGoals * i.awayAttack * i.homeDefense;
  addFactor(expl, multFactor('home_attack', 'Ataque local', i.homeAttack, 1));
  addFactor(expl, multFactor('away_defense', 'Defensa visita', i.awayDefense, 1));
  addFactor(expl, multFactor('away_attack', 'Ataque visita', i.awayAttack, -1));
  addFactor(expl, multFactor('home_defense', 'Defensa local', i.homeDefense, -1));

  // --- localía (solo potencia el ataque local) ---
  lambdaHome *= ha;
  addFactor(expl, multFactor('home_advantage', 'Localía', ha, 1));

  // --- forma ---
  if (i.formHome !== undefined) {
    const f = Math.exp(s.form * i.formHome);
    lambdaHome *= f;
    addFactor(expl, multFactor('form_home', 'Forma local', f, 1));
  }
  if (i.formAway !== undefined) {
    const f = Math.exp(s.form * i.formAway);
    lambdaAway *= f;
    addFactor(expl, multFactor('form_away', 'Forma visita', f, -1));
  }

  // --- descanso (relativo: favorece a un lado y perjudica al otro) ---
  if (i.restAdvantage !== undefined && i.restAdvantage !== 0) {
    const f = Math.exp(s.rest * i.restAdvantage);
    lambdaHome *= f;
    lambdaAway /= f;
    addFactor(expl, multFactor('rest', 'Descanso', f, 1));
  }

  // --- lesiones (más bajas => menos goles del propio equipo) ---
  if (i.injuriesHome) {
    const f = Math.exp(-s.injuries * i.injuriesHome);
    lambdaHome *= f;
    addFactor(expl, multFactor('injuries_home', 'Lesiones local', f, 1));
  }
  if (i.injuriesAway) {
    const f = Math.exp(-s.injuries * i.injuriesAway);
    lambdaAway *= f;
    addFactor(expl, multFactor('injuries_away', 'Lesiones visita', f, -1));
  }

  // saneo: lambdas siempre positivas y acotadas (evita explosión numérica).
  lambdaHome = Math.max(0.05, Math.min(lambdaHome, 6));
  lambdaAway = Math.max(0.05, Math.min(lambdaAway, 6));
  expl.summary = `λ ${lambdaHome.toFixed(2)} – ${lambdaAway.toFixed(2)}`;

  return { lambdaHome, lambdaAway, explanation: expl };
}
