export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          allocation_pct: number
          created_at: string
          end_date: string | null
          id: string
          person_id: string
          project_id: string
          project_part_id: string | null
          role_on_project: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          allocation_pct: number
          created_at?: string
          end_date?: string | null
          id?: string
          person_id: string
          project_id: string
          project_part_id?: string | null
          role_on_project?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          allocation_pct?: number
          created_at?: string
          end_date?: string | null
          id?: string
          person_id?: string
          project_id?: string
          project_part_id?: string | null
          role_on_project?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_workload_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_project_part_id_fkey"
            columns: ["project_part_id"]
            isOneToOne: false
            referencedRelation: "part_budget_rows"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "assignments_project_part_id_fkey"
            columns: ["project_part_id"]
            isOneToOne: false
            referencedRelation: "project_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: number
          ip: string | null
          metadata: Json
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: never
          ip?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: never
          ip?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      budget_items: {
        Row: {
          amount: number
          budget_id: string
          created_at: string
          created_by: string | null
          id: number
          item_type: Database["public"]["Enums"]["budget_item_type"]
          name: string
          note: string | null
          occurred_on: string
        }
        Insert: {
          amount: number
          budget_id: string
          created_at?: string
          created_by?: string | null
          id?: never
          item_type: Database["public"]["Enums"]["budget_item_type"]
          name: string
          note?: string | null
          occurred_on?: string
        }
        Update: {
          amount?: number
          budget_id?: string
          created_at?: string
          created_by?: string | null
          id?: never
          item_type?: Database["public"]["Enums"]["budget_item_type"]
          name?: string
          note?: string | null
          occurred_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          created_at: string
          currency: string
          id: string
          note: string | null
          part_id: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          part_id?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          part_id?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_budget_rows"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "budgets_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "project_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string | null
          description: string | null
          email: string | null
          first_name: string | null
          gender: Database["public"]["Enums"]["contact_gender"] | null
          id: string
          is_primary: boolean
          last_name: string | null
          name: string
          phone: string | null
          role: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          description?: string | null
          email?: string | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["contact_gender"] | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          name: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          description?: string | null
          email?: string | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["contact_gender"] | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          name?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          reg_code: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          reg_code?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          reg_code?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      credential_access: {
        Row: {
          credential_id: string
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: number
          user_id: string
        }
        Insert: {
          credential_id: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: never
          user_id: string
        }
        Update: {
          credential_id?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_access_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          created_at: string
          environment: Database["public"]["Enums"]["credential_environment"]
          expires_at: string | null
          id: string
          last_rotated_at: string | null
          name: string
          notes: string | null
          owner_id: string | null
          project_id: string
          related_url: string | null
          secret_id: string
          type: Database["public"]["Enums"]["credential_type"]
          updated_at: string
          username: string | null
          visibility: Database["public"]["Enums"]["credential_visibility"]
        }
        Insert: {
          created_at?: string
          environment?: Database["public"]["Enums"]["credential_environment"]
          expires_at?: string | null
          id?: string
          last_rotated_at?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          project_id: string
          related_url?: string | null
          secret_id: string
          type: Database["public"]["Enums"]["credential_type"]
          updated_at?: string
          username?: string | null
          visibility?: Database["public"]["Enums"]["credential_visibility"]
        }
        Update: {
          created_at?: string
          environment?: Database["public"]["Enums"]["credential_environment"]
          expires_at?: string | null
          id?: string
          last_rotated_at?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          project_id?: string
          related_url?: string | null
          secret_id?: string
          type?: Database["public"]["Enums"]["credential_type"]
          updated_at?: string
          username?: string | null
          visibility?: Database["public"]["Enums"]["credential_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "credentials_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          actor_id: string | null
          assignee_id: string | null
          body: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          contact_id: string | null
          created_at: string
          deal_id: string | null
          done_at: string | null
          done_by: string | null
          done_comment: string | null
          due_on: string | null
          edited_at: string | null
          edited_by: string | null
          id: string
          kind: Database["public"]["Enums"]["activity_kind"]
          metadata: Json
          occurred_at: string
          status: Database["public"]["Enums"]["activity_status"]
        }
        Insert: {
          actor_id?: string | null
          assignee_id?: string | null
          body?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          done_at?: string | null
          done_by?: string | null
          done_comment?: string | null
          due_on?: string | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["activity_kind"]
          metadata?: Json
          occurred_at?: string
          status?: Database["public"]["Enums"]["activity_status"]
        }
        Update: {
          actor_id?: string | null
          assignee_id?: string | null
          body?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          done_at?: string | null
          done_by?: string | null
          done_comment?: string | null
          due_on?: string | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          metadata?: Json
          occurred_at?: string
          status?: Database["public"]["Enums"]["activity_status"]
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          lost_reason: string | null
          owner_id: string
          project_id: string | null
          source: Database["public"]["Enums"]["deal_source"]
          stage: Database["public"]["Enums"]["deal_stage"]
          title: string
          updated_at: string
          won_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lost_reason?: string | null
          owner_id: string
          project_id?: string | null
          source?: Database["public"]["Enums"]["deal_source"]
          stage?: Database["public"]["Enums"]["deal_stage"]
          title: string
          updated_at?: string
          won_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lost_reason?: string | null
          owner_id?: string
          project_id?: string | null
          source?: Database["public"]["Enums"]["deal_source"]
          stage?: Database["public"]["Enums"]["deal_stage"]
          title?: string
          updated_at?: string
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_permissions: {
        Row: {
          delegation_id: string
          id: number
          permission_key: string
          project_id: string
        }
        Insert: {
          delegation_id: string
          id?: never
          permission_key: string
          project_id: string
        }
        Update: {
          delegation_id?: string
          id?: never
          permission_key?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegation_permissions_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "delegation_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      delegations: {
        Row: {
          created_at: string
          ends_at: string
          from_user: string
          handover_notes: string | null
          id: string
          revoked_at: string | null
          revoked_by: string | null
          starts_at: string
          to_user: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          from_user: string
          handover_notes?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at: string
          to_user: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          from_user?: string
          handover_notes?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at?: string
          to_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegations_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegations_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_options: {
        Row: {
          id: string
          kind: string
          sort: number
          value: string
        }
        Insert: {
          id?: string
          kind: string
          sort?: number
          value: string
        }
        Update: {
          id?: string
          kind?: string
          sort?: number
          value?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: number
          metadata: Json
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: never
          metadata?: Json
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: never
          metadata?: Json
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deal_id: string
          id: string
          link_url: string | null
          note: string | null
          sent_on: string | null
          status: Database["public"]["Enums"]["offer_status"]
          title: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deal_id: string
          id?: string
          link_url?: string | null
          note?: string | null
          sent_on?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          title: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deal_id?: string
          id?: string
          link_url?: string | null
          note?: string | null
          sent_on?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      part_billing: {
        Row: {
          client_price: number | null
          currency: string
          fixed_amount: number | null
          hourly_rate: number | null
          part_id: string
          updated_at: string
        }
        Insert: {
          client_price?: number | null
          currency?: string
          fixed_amount?: number | null
          hourly_rate?: number | null
          part_id: string
          updated_at?: string
        }
        Update: {
          client_price?: number | null
          currency?: string
          fixed_amount?: number | null
          hourly_rate?: number | null
          part_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_billing_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "part_budget_rows"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_billing_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "project_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      part_costs: {
        Row: {
          actual_internal_cost: number | null
          currency: string
          part_id: string
          planned_internal_cost: number | null
          updated_at: string
        }
        Insert: {
          actual_internal_cost?: number | null
          currency?: string
          part_id: string
          planned_internal_cost?: number | null
          updated_at?: string
        }
        Update: {
          actual_internal_cost?: number | null
          currency?: string
          part_id?: string
          planned_internal_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_costs_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "part_budget_rows"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_costs_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "project_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      part_dependencies: {
        Row: {
          depends_on_part_id: string
          part_id: string
        }
        Insert: {
          depends_on_part_id: string
          part_id: string
        }
        Update: {
          depends_on_part_id?: string
          part_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_dependencies_depends_on_part_id_fkey"
            columns: ["depends_on_part_id"]
            isOneToOne: false
            referencedRelation: "part_budget_rows"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_dependencies_depends_on_part_id_fkey"
            columns: ["depends_on_part_id"]
            isOneToOne: false
            referencedRelation: "project_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_dependencies_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_budget_rows"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_dependencies_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "project_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          avatar_url: string | null
          contacts: Json
          created_at: string
          department: string | null
          email: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          full_name: string
          id: string
          role_title: string | null
          status: Database["public"]["Enums"]["person_status"]
          updated_at: string
          user_id: string | null
          weekly_capacity_hours: number
        }
        Insert: {
          avatar_url?: string | null
          contacts?: Json
          created_at?: string
          department?: string | null
          email?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          full_name: string
          id?: string
          role_title?: string | null
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
          user_id?: string | null
          weekly_capacity_hours?: number
        }
        Update: {
          avatar_url?: string | null
          contacts?: Json
          created_at?: string
          department?: string | null
          email?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          full_name?: string
          id?: string
          role_title?: string | null
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
          user_id?: string | null
          weekly_capacity_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "people_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          delegatable: boolean
          description: string | null
          key: string
        }
        Insert: {
          delegatable?: boolean
          description?: string | null
          key: string
        }
        Update: {
          delegatable?: boolean
          description?: string | null
          key?: string
        }
        Relationships: []
      }
      person_skills: {
        Row: {
          level: number
          person_id: string
          skill_id: string
        }
        Insert: {
          level?: number
          person_id: string
          skill_id: string
        }
        Update: {
          level?: number
          person_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_skills_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_skills_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_workload_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      project_links: {
        Row: {
          created_at: string
          description: string | null
          environment: string | null
          id: string
          last_verified_at: string | null
          name: string
          owner_id: string | null
          project_id: string
          type: Database["public"]["Enums"]["link_type"]
          updated_at: string
          url: string
          visibility: Database["public"]["Enums"]["link_visibility"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          environment?: string | null
          id?: string
          last_verified_at?: string | null
          name: string
          owner_id?: string | null
          project_id: string
          type?: Database["public"]["Enums"]["link_type"]
          updated_at?: string
          url: string
          visibility?: Database["public"]["Enums"]["link_visibility"]
        }
        Update: {
          created_at?: string
          description?: string | null
          environment?: string | null
          id?: string
          last_verified_at?: string | null
          name?: string
          owner_id?: string | null
          project_id?: string
          type?: Database["public"]["Enums"]["link_type"]
          updated_at?: string
          url?: string
          visibility?: Database["public"]["Enums"]["link_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "project_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          ends_on: string | null
          id: number
          project_id: string
          role_on_project: string | null
          starts_on: string | null
          user_id: string
        }
        Insert: {
          ends_on?: string | null
          id?: never
          project_id: string
          role_on_project?: string | null
          starts_on?: string | null
          user_id: string
        }
        Update: {
          ends_on?: string | null
          id?: never
          project_id?: string
          role_on_project?: string | null
          starts_on?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          created_at: string | null
          done: boolean
          due_on: string
          id: string
          kind: string
          name: string
          project_id: string
          sort: number
        }
        Insert: {
          created_at?: string | null
          done?: boolean
          due_on: string
          id?: string
          kind?: string
          name: string
          project_id: string
          sort?: number
        }
        Update: {
          created_at?: string | null
          done?: boolean
          due_on?: string
          id?: string
          kind?: string
          name?: string
          project_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_parts: {
        Row: {
          billing_model: Database["public"]["Enums"]["billing_model"]
          created_at: string
          description: string | null
          end_date: string | null
          estimated_hours: number | null
          id: string
          name: string
          notes: string | null
          progress: number
          project_id: string
          responsible_person_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["part_status"]
          updated_at: string
        }
        Insert: {
          billing_model: Database["public"]["Enums"]["billing_model"]
          created_at?: string
          description?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          name: string
          notes?: string | null
          progress?: number
          project_id: string
          responsible_person_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["part_status"]
          updated_at?: string
        }
        Update: {
          billing_model?: Database["public"]["Enums"]["billing_model"]
          created_at?: string
          description?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          name?: string
          notes?: string | null
          progress?: number
          project_id?: string
          responsible_person_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["part_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_responsible_fk"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_responsible_fk"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "person_workload_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_status_updates: {
        Row: {
          author_id: string
          blockers: string | null
          completed: string | null
          created_at: string
          decisions_needed: string | null
          handover_info: string | null
          id: number
          in_progress: string | null
          next_milestone: string | null
          project_id: string
        }
        Insert: {
          author_id: string
          blockers?: string | null
          completed?: string | null
          created_at?: string
          decisions_needed?: string | null
          handover_info?: string | null
          id?: never
          in_progress?: string | null
          next_milestone?: string | null
          project_id: string
        }
        Update: {
          author_id?: string
          blockers?: string | null
          completed?: string | null
          created_at?: string
          decisions_needed?: string | null
          handover_info?: string | null
          id?: never
          in_progress?: string | null
          next_milestone?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_status_updates_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_status_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_status_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_status_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          blockers: string | null
          budget_type: Database["public"]["Enums"]["budget_type"]
          client_contact_id: string | null
          client_id: string | null
          client_notes: string | null
          created_at: string
          deadline: string | null
          description: string | null
          health: Database["public"]["Enums"]["project_health"]
          id: string
          internal_notes: string | null
          name: string
          next_steps: string | null
          owner_id: string | null
          pm_id: string | null
          priority: Database["public"]["Enums"]["project_priority"]
          progress: number
          risks: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          blockers?: string | null
          budget_type: Database["public"]["Enums"]["budget_type"]
          client_contact_id?: string | null
          client_id?: string | null
          client_notes?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["project_health"]
          id?: string
          internal_notes?: string | null
          name: string
          next_steps?: string | null
          owner_id?: string | null
          pm_id?: string | null
          priority?: Database["public"]["Enums"]["project_priority"]
          progress?: number
          risks?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          blockers?: string | null
          budget_type?: Database["public"]["Enums"]["budget_type"]
          client_contact_id?: string | null
          client_id?: string | null
          client_notes?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["project_health"]
          id?: string
          internal_notes?: string | null
          name?: string
          next_steps?: string | null
          owner_id?: string | null
          pm_id?: string | null
          priority?: Database["public"]["Enums"]["project_priority"]
          progress?: number
          risks?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_pm_id_fkey"
            columns: ["pm_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rates: {
        Row: {
          amount: number
          currency: string
          id: number
          person_id: string
          rate_type: Database["public"]["Enums"]["rate_type"]
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          amount: number
          currency?: string
          id?: never
          person_id: string
          rate_type: Database["public"]["Enums"]["rate_type"]
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          amount?: number
          currency?: string
          id?: never
          person_id?: string
          rate_type?: Database["public"]["Enums"]["rate_type"]
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_workload_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_key: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }
        Insert: {
          permission_key: string
          role_key: string
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Update: {
          permission_key?: string
          role_key?: string
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      roles: {
        Row: {
          description: string | null
          key: string
          name: string
        }
        Insert: {
          description?: string | null
          key: string
          name: string
        }
        Update: {
          description?: string | null
          key?: string
          name?: string
        }
        Relationships: []
      }
      skills: {
        Row: {
          category: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          billable: boolean
          created_at: string
          description: string | null
          entry_date: string
          hours: number
          id: number
          person_id: string
          project_id: string
          project_part_id: string | null
        }
        Insert: {
          billable?: boolean
          created_at?: string
          description?: string | null
          entry_date: string
          hours: number
          id?: never
          person_id: string
          project_id: string
          project_part_id?: string | null
        }
        Update: {
          billable?: boolean
          created_at?: string
          description?: string | null
          entry_date?: string
          hours?: number
          id?: never
          person_id?: string
          project_id?: string
          project_part_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_workload_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_part_id_fkey"
            columns: ["project_part_id"]
            isOneToOne: false
            referencedRelation: "part_budget_rows"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "time_entries_project_part_id_fkey"
            columns: ["project_part_id"]
            isOneToOne: false
            referencedRelation: "project_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off: {
        Row: {
          ends_on: string
          id: number
          note: string | null
          person_id: string
          starts_on: string
          type: Database["public"]["Enums"]["time_off_type"]
        }
        Insert: {
          ends_on: string
          id?: never
          note?: string | null
          person_id: string
          starts_on: string
          type?: Database["public"]["Enums"]["time_off_type"]
        }
        Update: {
          ends_on?: string
          id?: never
          note?: string | null
          person_id?: string
          starts_on?: string
          type?: Database["public"]["Enums"]["time_off_type"]
        }
        Relationships: [
          {
            foreignKeyName: "time_off_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_workload_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      user_project_permissions: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: number
          permission_key: string
          project_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: never
          permission_key: string
          project_id: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: never
          permission_key?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upp_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upp_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upp_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_project_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_project_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_project_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role_key: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role_key: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      company_next_steps: {
        Row: {
          activity_id: string | null
          assignee_id: string | null
          body: string | null
          client_id: string | null
          contact_id: string | null
          deal_id: string | null
          due_on: string | null
          kind: Database["public"]["Enums"]["activity_kind"] | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_next_steps: {
        Row: {
          activity_id: string | null
          assignee_id: string | null
          body: string | null
          client_id: string | null
          contact_id: string | null
          deal_id: string | null
          due_on: string | null
          kind: Database["public"]["Enums"]["activity_kind"] | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      part_budget_rows: {
        Row: {
          actual_internal_cost: number | null
          billable_hours: number | null
          billing_model: Database["public"]["Enums"]["billing_model"] | null
          client_price: number | null
          estimated_hours: number | null
          fixed_amount: number | null
          hourly_rate: number | null
          invoiced: number | null
          logged_hours: number | null
          margin: number | null
          margin_pct: number | null
          paid: number | null
          part_id: string | null
          part_name: string | null
          planned_internal_cost: number | null
          project_id: string | null
          remaining: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_parts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      person_workload_rows: {
        Row: {
          active_project_count: number | null
          avatar_url: string | null
          billing_rate: number | null
          current_allocation_pct: number | null
          department: string | null
          employment_type: Database["public"]["Enums"]["employment_type"] | null
          full_name: string | null
          id: string | null
          internal_cost: number | null
          on_vacation_now: boolean | null
          role_title: string | null
          skills: string[] | null
          status: Database["public"]["Enums"]["person_status"] | null
          vacation_ends_on: string | null
          weekly_capacity_hours: number | null
        }
        Relationships: []
      }
      project_budget_rows: {
        Row: {
          budget_type: Database["public"]["Enums"]["budget_type"] | null
          client_amount: number | null
          client_name: string | null
          consumption_pct: number | null
          health: Database["public"]["Enums"]["project_health"] | null
          id: string | null
          internal_cost: number | null
          invoiced: number | null
          margin: number | null
          margin_pct: number | null
          name: string | null
          paid: number | null
          remaining: number | null
        }
        Relationships: []
      }
      project_list_rows: {
        Row: {
          budget_remaining: number | null
          budget_total: number | null
          budget_type: Database["public"]["Enums"]["budget_type"] | null
          budget_used: number | null
          client_name: string | null
          deadline: string | null
          health: Database["public"]["Enums"]["project_health"] | null
          id: string | null
          member_count: number | null
          name: string | null
          pm_avatar_url: string | null
          pm_name: string | null
          priority: Database["public"]["Enums"]["project_priority"] | null
          progress: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_project_person: {
        Args: {
          p_allocation: number
          p_end: string
          p_project: string
          p_role: string
          p_start: string
          p_user_id: string
        }
        Returns: undefined
      }
      admin_revoke_user_sessions: {
        Args: { target_user: string }
        Returns: number
      }
      app_date_label: { Args: { d: string }; Returns: string }
      cancel_step: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      company_kind: { Args: { company: string }; Returns: string }
      complete_activity: {
        Args: {
          p_comment: string
          p_done_by: string
          p_done_on: string
          p_id: string
        }
        Returns: undefined
      }
      create_credential_secret: {
        Args: {
          secret: string
          secret_description?: string
          secret_name: string
        }
        Returns: string
      }
      create_delegation: {
        Args: {
          p_ends_at: string
          p_handover_notes?: string
          p_permission_keys: string[]
          p_project_ids: string[]
          p_starts_at: string
          p_to_user: string
        }
        Returns: string
      }
      create_lead: {
        Args: {
          p_client_id: string
          p_company: Json
          p_contact: Json
          p_deal: Json
          p_step?: Json
        }
        Returns: Json
      }
      current_person_id: { Args: never; Returns: string }
      edit_entry: {
        Args: {
          p_body: string
          p_contact: string
          p_deal: string
          p_id: string
          p_kind: Database["public"]["Enums"]["activity_kind"]
          p_occurred_at: string
        }
        Returns: undefined
      }
      has_credential_access: {
        Args: { cred_id: string; uid?: string }
        Returns: boolean
      }
      has_permission: {
        Args: { perm: string; project?: string; uid: string }
        Returns: boolean
      }
      is_admin: { Args: { uid?: string }; Returns: boolean }
      is_sales_assignable: { Args: { uid: string }; Returns: boolean }
      list_my_sessions: {
        Args: never
        Returns: {
          created_at: string
          id: string
          ip: string
          updated_at: string
          user_agent: string
        }[]
      }
      migrate_deal_follow_ups: { Args: never; Returns: number }
      normalize_reg_code: { Args: { code: string }; Returns: string }
      part_project: { Args: { p_part: string }; Returns: string }
      person_current_allocation: {
        Args: { p_person: string }
        Returns: {
          allocation_pct: number
          project_count: number
        }[]
      }
      person_has_history: { Args: { p_person: string }; Returns: boolean }
      person_weekly_allocation: {
        Args: { p_from: string; p_person: string; p_weeks: number }
        Returns: {
          allocation_pct: number
          week_start: string
        }[]
      }
      pm_options: {
        Args: never
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      prospect_client_ids: { Args: never; Returns: string[] }
      reassign_activity: {
        Args: { p_assignee: string; p_id: string }
        Returns: undefined
      }
      remove_project_person: {
        Args: { p_project: string; p_user_id: string }
        Returns: undefined
      }
      reschedule_activity: {
        Args: { p_due_on: string; p_id: string }
        Returns: undefined
      }
      reveal_credential_secret: {
        Args: { cred_id: string }
        Returns: {
          project_id: string
          secret: string
        }[]
      }
      revoke_session: { Args: { session_id: string }; Returns: boolean }
      sales_people: {
        Args: never
        Returns: {
          assignable: boolean
          avatar_url: string
          id: string
          name: string
        }[]
      }
      set_person_allocation: {
        Args: { p_allocation: number; p_project: string; p_user_id: string }
        Returns: undefined
      }
      set_sales_access: {
        Args: { enabled: boolean; target_user: string }
        Returns: undefined
      }
      set_user_role: {
        Args: { new_role: string; target_user: string }
        Returns: undefined
      }
      stage_label: {
        Args: { s: Database["public"]["Enums"]["deal_stage"] }
        Returns: string
      }
      update_step: {
        Args: {
          p_assignee: string
          p_body: string
          p_contact: string
          p_deal: string
          p_due_on: string
          p_id: string
          p_kind: Database["public"]["Enums"]["activity_kind"]
        }
        Returns: undefined
      }
    }
    Enums: {
      activity_kind: "call" | "email" | "meeting" | "note" | "system"
      activity_status: "planned" | "done" | "cancelled"
      billing_model: "fixed" | "hourly"
      budget_item_type:
        | "planned_cost"
        | "actual_cost"
        | "invoice"
        | "payment"
        | "change"
      budget_type: "fixed" | "hourly" | "mixed"
      contact_gender: "female" | "male" | "other"
      credential_environment: "prod" | "prelive" | "staging" | "dev" | "other"
      credential_type:
        | "server_login"
        | "db_login"
        | "api_key"
        | "hosting"
        | "admin_panel"
        | "third_party"
        | "ssh"
        | "client_provided"
      credential_visibility: "project_members" | "pms_only" | "admins_only"
      deal_source:
        | "inbound"
        | "outbound"
        | "referral"
        | "existing_client"
        | "event"
        | "other"
      deal_stage:
        | "new"
        | "contacted"
        | "offer_sent"
        | "negotiation"
        | "won"
        | "lost"
      employment_type: "employee" | "contractor" | "freelance"
      link_type:
        | "repo"
        | "issue_tracker"
        | "design"
        | "docs"
        | "env_prod"
        | "env_prelive"
        | "env_staging"
        | "env_dev"
        | "api_docs"
        | "monitoring"
        | "hosting"
        | "db_dashboard"
        | "custom"
      link_visibility: "project" | "pm_only" | "admins_only"
      offer_status: "draft" | "sent" | "accepted" | "rejected"
      part_status: "not_started" | "in_progress" | "blocked" | "done"
      permission_scope: "global" | "own_projects" | "member_projects"
      person_status: "active" | "inactive"
      project_health: "healthy" | "warning" | "critical"
      project_priority: "low" | "medium" | "high"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "archived"
      rate_type: "internal_cost" | "billing"
      time_off_type: "vacation" | "sick" | "other"
      user_status: "pending" | "active" | "disabled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_kind: ["call", "email", "meeting", "note", "system"],
      activity_status: ["planned", "done", "cancelled"],
      billing_model: ["fixed", "hourly"],
      budget_item_type: [
        "planned_cost",
        "actual_cost",
        "invoice",
        "payment",
        "change",
      ],
      budget_type: ["fixed", "hourly", "mixed"],
      contact_gender: ["female", "male", "other"],
      credential_environment: ["prod", "prelive", "staging", "dev", "other"],
      credential_type: [
        "server_login",
        "db_login",
        "api_key",
        "hosting",
        "admin_panel",
        "third_party",
        "ssh",
        "client_provided",
      ],
      credential_visibility: ["project_members", "pms_only", "admins_only"],
      deal_source: [
        "inbound",
        "outbound",
        "referral",
        "existing_client",
        "event",
        "other",
      ],
      deal_stage: [
        "new",
        "contacted",
        "offer_sent",
        "negotiation",
        "won",
        "lost",
      ],
      employment_type: ["employee", "contractor", "freelance"],
      link_type: [
        "repo",
        "issue_tracker",
        "design",
        "docs",
        "env_prod",
        "env_prelive",
        "env_staging",
        "env_dev",
        "api_docs",
        "monitoring",
        "hosting",
        "db_dashboard",
        "custom",
      ],
      link_visibility: ["project", "pm_only", "admins_only"],
      offer_status: ["draft", "sent", "accepted", "rejected"],
      part_status: ["not_started", "in_progress", "blocked", "done"],
      permission_scope: ["global", "own_projects", "member_projects"],
      person_status: ["active", "inactive"],
      project_health: ["healthy", "warning", "critical"],
      project_priority: ["low", "medium", "high"],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "archived",
      ],
      rate_type: ["internal_cost", "billing"],
      time_off_type: ["vacation", "sick", "other"],
      user_status: ["pending", "active", "disabled"],
    },
  },
} as const

