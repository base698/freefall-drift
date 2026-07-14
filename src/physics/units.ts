export const FT_TO_M = 0.3048;
export const M_TO_FT = 1 / FT_TO_M;
export const MPH_TO_MPS = 0.44704;
export const MPS_TO_MPH = 1 / MPH_TO_MPS;

export const ft = (value: number): number => value * FT_TO_M;
export const mToFt = (value: number): number => value * M_TO_FT;
export const mph = (value: number): number => value * MPH_TO_MPS;
export const mpsToMph = (value: number): number => value * MPS_TO_MPH;
