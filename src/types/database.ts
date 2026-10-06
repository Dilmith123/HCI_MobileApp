// ── Database Row Types ────────────────────────────────────────────────────────

export type PetReport = {
  id: string;
  user_id: string;
  name: string;
  species: string;
  location: string;
  district: string;
  contact: string;
  description: string | null;
  status: 'LOST' | 'FOUND';
  image_url: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
};

// ── Insert / Update helpers ───────────────────────────────────────────────────

export type NewReport = Omit<PetReport, 'id' | 'created_at'>;
export type UpdateReport = Partial<Omit<PetReport, 'id' | 'user_id' | 'created_at'>>;

// ── Search filter shape ───────────────────────────────────────────────────────

export type ReportFilters = {
  query?: string;
  species?: string;
  status?: string;
  district?: string;
};
