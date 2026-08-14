export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          branch_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          branch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          branch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_activity_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      abandoned_carts: {
        Row: {
          converted: boolean
          created_at: string
          id: string
          items: Json
          items_count: number
          reached_checkout: boolean
          session_id: string
          total: number
          updated_at: string
          user_id: string | null
          branch_id: string | null
        }
        Insert: {
          converted?: boolean
          created_at?: string
          id?: string
          items?: Json
          items_count?: number
          reached_checkout?: boolean
          session_id: string
          total?: number
          updated_at?: string
          user_id?: string | null
          branch_id?: string | null
        }
        Update: {
          converted?: boolean
          created_at?: string
          id?: string
          items?: Json
          items_count?: number
          reached_checkout?: boolean
          session_id?: string
          total?: number
          updated_at?: string
          user_id?: string | null
          branch_id?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          bg_color: string | null
          content: string | null
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          bg_color?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          bg_color?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      branch_inventory: {
        Row: {
          branch_id: string
          id: string
          is_available: boolean
          product_id: string
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          id?: string
          is_available?: boolean
          product_id: string
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          id?: string
          is_available?: boolean
          product_id?: string
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_inventory_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          phone: string | null
          slug: string
          city: string | null
          work_start: string
          work_end: string
          delivery_fee: number
          free_delivery_threshold: number
          min_order: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          name: string
          phone?: string | null
          slug?: string
          city?: string | null
          work_start?: string
          work_end?: string
          delivery_fee?: number
          free_delivery_threshold?: number
          min_order?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          phone?: string | null
          slug?: string
          city?: string | null
          work_start?: string
          work_end?: string
          delivery_fee?: number
          free_delivery_threshold?: number
          min_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          image: string | null
          is_active: boolean
          name: string
          name_en: string | null
          section: string | null
          slug: string
          sort_order: number
          branch_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image?: string | null
          is_active?: boolean
          name: string
          name_en?: string | null
          section?: string | null
          slug: string
          sort_order?: number
          branch_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image?: string | null
          is_active?: boolean
          name?: string
          name_en?: string | null
          section?: string | null
          slug?: string
          sort_order?: number
          branch_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      complaints: {
        Row: {
          admin_reply: string | null
          created_at: string
          id: string
          image_urls: string[] | null
          message: string
          order_id: string | null
          replied_at: string | null
          status: Database["public"]["Enums"]["complaint_status"]
          type: Database["public"]["Enums"]["complaint_type"]
          updated_at: string
          user_id: string
          branch_id: string | null
        }
        Insert: {
          admin_reply?: string | null
          created_at?: string
          id?: string
          image_urls?: string[] | null
          message: string
          order_id?: string | null
          replied_at?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          type?: Database["public"]["Enums"]["complaint_type"]
          updated_at?: string
          user_id: string
          branch_id?: string | null
        }
        Update: {
          admin_reply?: string | null
          created_at?: string
          id?: string
          image_urls?: string[] | null
          message?: string
          order_id?: string | null
          replied_at?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          type?: Database["public"]["Enums"]["complaint_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_ratings: {
        Row: {
          comment: string | null
          created_at: string
          driver_id: string
          id: string
          order_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          driver_id: string
          id?: string
          order_id: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          order_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_ratings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_wallet: {
        Row: {
          balance: number
          commission_rate: number
          created_at: string
          driver_id: string
          id: string
          total_collected: number
          total_commission: number
          updated_at: string
        }
        Insert: {
          balance?: number
          commission_rate?: number
          created_at?: string
          driver_id: string
          id?: string
          total_collected?: number
          total_commission?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          commission_rate?: number
          created_at?: string
          driver_id?: string
          id?: string
          total_collected?: number
          total_commission?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_wallet_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_lat: number | null
          current_lng: number | null
          email: string | null
          full_name: string | null
          id: string
          id_number: string | null
          is_available: boolean
          phone: string | null
          rating: number | null
          status: string
          total_deliveries: number
          total_earnings: number
          updated_at: string
          user_id: string
          vehicle_type: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          id_number?: string | null
          is_available?: boolean
          phone?: string | null
          rating?: number | null
          status?: string
          total_deliveries?: number
          total_earnings?: number
          updated_at?: string
          user_id: string
          vehicle_type?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          id_number?: string | null
          is_available?: boolean
          phone?: string | null
          rating?: number | null
          status?: string
          total_deliveries?: number
          total_earnings?: number
          updated_at?: string
          user_id?: string
          vehicle_type?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_image: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_image?: string | null
          product_name: string
          quantity?: number
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_image?: string | null
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_at: string | null
          branch_id: string | null
          collected_amount: number
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee: number
          delivery_lat: number | null
          delivery_lng: number | null
          driver_id: string | null
          id: string
          notes: string | null
          order_number: number
          payment_id: string | null
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          discount_percent: number
          discount_amount: number
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          branch_id?: string | null
          collected_amount?: number
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          payment_id?: string | null
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          discount_percent?: number
          discount_amount?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          branch_id?: string | null
          collected_amount?: number
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          payment_id?: string | null
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          discount_percent?: number
          discount_amount?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          created_at: string
          id: string
          path: string
          referrer: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
          branch_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          path: string
          referrer?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
          branch_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
          branch_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          method: string
          moyasar_payment_id: string | null
          order_id: string
          raw_response: Json | null
          refund_amount: number | null
          refunded_at: string | null
          source: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          method: string
          moyasar_payment_id?: string | null
          order_id: string
          raw_response?: Json | null
          refund_amount?: number | null
          refunded_at?: string | null
          source?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string
          moyasar_payment_id?: string | null
          order_id?: string
          raw_response?: Json | null
          refund_amount?: number | null
          refunded_at?: string | null
          source?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          extra_label: string | null
          gallery_urls: string[] | null
          id: string
          image: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          name_en: string | null
          origin_country: string | null
          original_price: number | null
          price: number
          product_form: string | null
          size_label: string | null
          sort_order: number
          stock_quantity: number
          branch_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          extra_label?: string | null
          gallery_urls?: string[] | null
          id?: string
          image?: string | null
          is_active?: boolean
          is_featured?: boolean
          name: string
          name_en?: string | null
          origin_country?: string | null
          original_price?: number | null
          price?: number
          product_form?: string | null
          size_label?: string | null
          sort_order?: number
          stock_quantity?: number
          branch_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          extra_label?: string | null
          gallery_urls?: string[] | null
          id?: string
          image?: string | null
          is_active?: boolean
          is_featured?: boolean
          name?: string
          name_en?: string | null
          origin_country?: string | null
          original_price?: number | null
          price?: number
          product_form?: string | null
          size_label?: string | null
          sort_order?: number
          stock_quantity?: number
          branch_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          discount_percent: number | null
          full_name: string | null
          id: string
          contact_email: string | null
          id_number: string | null
          phone: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          contact_email?: string | null
          created_at?: string
          discount_percent?: number | null
          full_name?: string | null
          id?: string
          id_number?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          contact_email?: string | null
          created_at?: string
          discount_percent?: number | null
          full_name?: string | null
          id?: string
          id_number?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          polygon: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          polygon?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          polygon?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_addresses: {
        Row: {
          address: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          lat: number
          lng: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lat: number
          lng: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lat?: number
          lng?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          driver_id: string
          id: string
          notes: string | null
          order_id: string | null
          type: Database["public"]["Enums"]["wallet_transaction_type"]
        }
        Insert: {
          amount?: number
          created_at?: string
          driver_id: string
          id?: string
          notes?: string | null
          order_id?: string | null
          type: Database["public"]["Enums"]["wallet_transaction_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          driver_id?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          type?: Database["public"]["Enums"]["wallet_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      create_driver: {
        Args: {
          p_full_name: string
          p_username: string
          p_password: string
          p_phone?: string
          p_id_number?: string
          p_vehicle_type?: string
          p_branch_id?: string
        }
        Returns: Json
      }
      log_admin_activity: {
        Args: {
          p_action: string
          p_entity_type: string
          p_summary: string
          p_entity_id?: string
          p_branch_id?: string
          p_metadata?: Json
        }
        Returns: string
      }
      purge_admin_activity_log: {
        Args: Record<string, never>
        Returns: number
      }
      create_site_staff: {
        Args: {
          p_full_name: string
          p_username: string
          p_password: string
          p_role: string
          p_phone?: string
          p_contact_email?: string
          p_id_number?: string
          p_branch_ids?: string[]
        }
        Returns: Json
      }
      create_branch_manager: {
        Args: {
          p_full_name: string
          p_username: string
          p_password: string
          p_branch_id: string
        }
        Returns: Json
      }
      get_branch_manager_account: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_customer_emails: {
        Args: Record<string, never>
        Returns: {
          user_id: string
          email: string | null
        }[]
      }
      update_branch_manager: {
        Args: {
          p_user_id: string
          p_full_name: string
          p_username: string
          p_password?: string
        }
        Returns: Json
      }
      is_within_delivery_zone: {
        Args: { p_lat: number; p_lng: number }
        Returns: boolean
      }
      point_in_polygon: {
        Args: { p_lat: number; p_lng: number; p_polygon: Json }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "customer" | "driver" | "store_admin" | "site_admin" | "accountant" | "inventory" | "support"
      complaint_status: "open" | "in_progress" | "resolved"
      complaint_type: "complaint" | "inquiry"
      order_status:
        | "pending"
        | "assigned"
        | "preparing"
        | "on_the_way"
        | "delivered"
        | "cancelled"
      payment_status: "pending" | "paid" | "failed" | "refunded" | "cancelled"
      wallet_transaction_type: "collection" | "commission" | "settlement"
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
  public: {
    Enums: {
      app_role: ["customer", "driver", "store_admin", "site_admin", "accountant", "inventory", "support"],
      complaint_status: ["open", "in_progress", "resolved"],
      complaint_type: ["complaint", "inquiry"],
      order_status: [
        "pending",
        "assigned",
        "preparing",
        "on_the_way",
        "delivered",
        "cancelled",
      ],
      payment_status: ["pending", "paid", "failed", "refunded", "cancelled"],
      wallet_transaction_type: ["collection", "commission", "settlement"],
    },
  },
} as const
