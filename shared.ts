export type Json =
  | null
  | string
  | number
  | boolean
  | Json[]
  | { [name: string]: Json };
