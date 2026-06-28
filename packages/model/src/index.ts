// @sti/model — librería del modelo ensemble (Dixon-Coles + Elo + contexto).
// TS puro, sin UI ni Supabase. Importable desde Node (frontend/tests) y Deno
// (Edge Functions). El cómputo se ejecuta en la Edge Function `run-model` y los
// resultados se persisten; el frontend solo lee.

export * from './types';
export * from './explain';
export * from './model';
export * from './elo';
export * from './lambdas';
export * from './xg';
export * from './montecarlo';
export * from './poisson';
export * from './ensemble';
export * from './dynamicweights';
export * from './context';
export * from './value';
export * from './market';
export * from './confidence';
export * from './calibration';
