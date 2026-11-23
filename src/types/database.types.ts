export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      rfr_accounts: {
        Row: {
          id: string
          username: string
          region: string | null
          level: number | null
          current_xp: number | null
          decimal_level: number | null
          remaining_xp: number | null
          first_win_available_time: string | null
          first_win_ready: boolean | null
          last_active: string | null
          archived: boolean | null
          order_index: number | null
          updated_at: string | null
          team_key: string | null
          assigned_worker: string | null
          encrypted_password: string | null
          delivery_status: string | null
          delivered_at: string | null
          puuid?: string | null
          rate?: string | null
          payment_status?: string | null
          paid_at?: string | null
        }
        Insert: {
          id: string
          username: string
          region?: string | null
          level?: number | null
          current_xp?: number | null
          decimal_level?: number | null
          remaining_xp?: number | null
          first_win_available_time?: string | null
          first_win_ready?: boolean | null
          last_active?: string | null
          archived?: boolean | null
          order_index?: number | null
          updated_at?: string | null
          team_key?: string | null
          assigned_worker?: string | null
          encrypted_password?: string | null
          delivery_status?: string | null
          delivered_at?: string | null
          puuid?: string | null
          rate?: string | null
          payment_status?: string | null
          paid_at?: string | null
        }
        Update: {
          id?: string
          username?: string
          region?: string | null
          level?: number | null
          current_xp?: number | null
          decimal_level?: number | null
          remaining_xp?: number | null
          first_win_available_time?: string | null
          first_win_ready?: boolean | null
          last_active?: string | null
          archived?: boolean | null
          order_index?: number | null
          updated_at?: string | null
          team_key?: string | null
          assigned_worker?: string | null
          encrypted_password?: string | null
          delivery_status?: string | null
          delivered_at?: string | null
          puuid?: string | null
          rate?: string | null
          payment_status?: string | null
          paid_at?: string | null
        }
        Relationships: []
      }
      app_licenses: {
        Row: {
          license_key: string
          tier: 'supplier' | 'solo_pro'
          expires_at: string | null
          hwid: string | null
          activated_at: string | null
          notes: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          license_key: string
          tier: 'supplier' | 'solo_pro'
          expires_at?: string | null
          hwid?: string | null
          activated_at?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          license_key?: string
          tier?: 'supplier' | 'solo_pro'
          expires_at?: string | null
          hwid?: string | null
          activated_at?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
