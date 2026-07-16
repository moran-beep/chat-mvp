export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          room_id: string;
          username: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          username: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          username?: string;
          content?: string;
          created_at?: string;
        };
      };
    };
  };
}
