import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  Eye,
  EyeOff,
  Home,
  Loader2,
  LogOut,
  LockKeyhole,
  Mail,
  MapPin,
  PawPrint,
  Phone,
  PlusCircle,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getSession,
  signIn,
  signUp,
  signOut,
  resetPassword,
  fetchReports,
  fetchMyReports,
  submitReport,
  uploadPetImage,
  updateReportStatus,
  deleteReport,
} from '@/lib/api';
import type { PetReport, NewReport, ReportFilters } from '@/types/database';

// ── Types ─────────────────────────────────────────────────────────────────────

type Screen = 'splash' | 'start' | 'login' | 'signup' | 'home';
type Tab = 'Home' | 'Search' | 'Report' | 'My Reports' | 'Profile';

// ── Validation helpers ────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

function requiredError(field: string, value: string | null | undefined): string | null {
  if (value == null || String(value).trim().length === 0) return `${field} is required.`;
  return null;
}

function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  // Allow digits, spaces, hyphens, plus, and parentheses
  const phoneRegex = /^[0-9\s\-\+\(\)]+$/;
  return phoneRegex.test(trimmed) && trimmed.replace(/\D/g, '').length >= 8;
}

// ── Static fallback (used when Supabase env vars are not set) ─────────────────

const STATIC_REPORTS: PetReport[] = [
  { id: '1', user_id: '', name: 'Milo', species: 'Cat', location: 'Kandy, Central Province', district: 'Kandy', contact: '', description: null, status: 'LOST', image_url: 'https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', created_at: '2025-03-18T00:00:00Z' },
  { id: '2', user_id: '', name: 'Luna', species: 'Dog', location: 'Negombo', district: 'Gampaha', contact: '', description: null, status: 'FOUND', image_url: 'https://images.pexels.com/photos/2253275/pexels-photo-2253275.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', created_at: '2025-03-18T00:00:00Z' },
  { id: '3', user_id: '', name: 'Simbab', species: 'Cat', location: 'Colombo', district: 'Colombo', contact: '', description: null, status: 'LOST', image_url: 'https://images.pexels.com/photos/320014/pexels-photo-320014.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', created_at: '2025-03-18T00:00:00Z' },
  { id: '4', user_id: '', name: 'Handra', species: 'Cat', location: 'Kandy, Pallekele', district: 'Kandy', contact: '', description: null, status: 'LOST', image_url: 'https://images.pexels.com/photos/1521304/pexels-photo-1521304.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', created_at: '2025-03-18T00:00:00Z' },
  { id: '5', user_id: '', name: 'Jerry', species: 'Cat', location: 'Kandy, 78 Main Street', district: 'Kandy', contact: '', description: null, status: 'LOST', image_url: 'https://images.pexels.com/photos/104827/cat-pet-animal-domestic-104827.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', created_at: '2025-03-18T00:00:00Z' },
  { id: '6', user_id: '', name: 'Raw', species: 'Dog', location: 'Colombo', district: 'Colombo', contact: '', description: null, status: 'FOUND', image_url: 'https://images.pexels.com/photos/3361739/pexels-photo-3361739.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', created_at: '2025-03-18T00:00:00Z' },
  { id: '7', user_id: '', name: 'Kandy', species: 'Cat', location: 'Central Park', district: 'Kandy', contact: '', description: null, status: 'LOST', image_url: 'https://images.pexels.com/photos/774731/pexels-photo-774731.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', created_at: '2025-03-18T00:00:00Z' },
  { id: '8', user_id: '', name: 'Pradereniya', species: 'Dog', location: 'Main Street', district: 'Colombo', contact: '', description: null, status: 'FOUND', image_url: 'https://images.pexels.com/photos/1108099/pexels-photo-1108099.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', created_at: '2025-03-18T00:00:00Z' },
  { id: '9', user_id: '', name: 'Nanny', species: 'Cat', location: 'Kandy', district: 'Kandy', contact: '', description: null, status: 'LOST', image_url: 'https://images.pexels.com/photos/596590/pexels-photo-596590.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', created_at: '2025-03-18T00:00:00Z' },
  { id: '10', user_id: '', name: 'Baby', species: 'Dog', location: 'Main Street', district: 'Colombo', contact: '', description: null, status: 'LOST', image_url: 'https://images.pexels.com/photos/58997/pexels-photo-58997.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', created_at: '2025-03-18T00:00:00Z' },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-GB'); } catch { return ''; }
}

function useDebounce<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

type FieldProps = {
  icon: typeof Mail;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  right?: React.ReactNode;
};
function Field({ icon: Icon, type = 'text', placeholder, value, onChange, right }: FieldProps) {
  return (
    <label className="field">
      <Icon size={19} strokeWidth={2} />
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={type === 'password' ? 'current-password' : undefined}
      />
      {right}
    </label>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <PawPrint className="brand-paw" size={compact ? 74 : 78} strokeWidth={2.1} />
      <div className="brand-name">PAWLO</div>
    </div>
  );
}

type BottomNavProps = { activeTab: Tab; onTabChange: (t: Tab) => void };
function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs: { label: Tab; icon: typeof Home }[] = [
    { label: 'Home', icon: Home },
    { label: 'Search', icon: Search },
    { label: 'Report', icon: PlusCircle },
    { label: 'My Reports', icon: PawPrint },
    { label: 'Profile', icon: UserRound },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map(({ label, icon: Icon }) => (
        <button
          key={label}
          className={activeTab === label ? 'active' : ''}
          onClick={() => onTabChange(label)}
        >
          <Icon size={16} strokeWidth={activeTab === label ? 2.8 : 2} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Spinner() {
  return (
    <div className="spinner-wrap" aria-label="Loading">
      <Loader2 size={26} strokeWidth={2.2} className="spinner" />
    </div>
  );
}

function ReportCard({ report }: { report: PetReport }) {
  return (
    <article className="report-card">
      <img
        src={report.image_url ?? 'https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg?auto=compress&cs=tinysrgb&h=200&w=200'}
        alt={`${report.name} the ${report.species}`}
      />
      <div className="report-details">
        <strong>{report.name}</strong>
        <span>{report.location}</span>
        <span>{fmtDate(report.created_at)}</span>
        <b className={report.status === 'FOUND' ? 'badge-found' : ''}>{report.status}</b>
      </div>
    </article>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────

function HomeScreen({ onTabChange }: { onTabChange: (t: Tab) => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('Home');
  const [reports, setReports] = useState<PetReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    if (!supabase) {
      // No Supabase configured — use static data
      setReports(STATIC_REPORTS);
      setLoading(false);
      return;
    }

    fetchReports()
      .then((data) => { if (!cancelled) setReports(data.length ? data : STATIC_REPORTS); })
      .catch(() => { if (!cancelled) { setReports(STATIC_REPORTS); setError('Could not load live data. Showing sample reports.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const handleTabChange = (t: Tab) => { setActiveTab(t); onTabChange(t); };

  return (
    <main className="app-shell home-screen">
      <header className="home-header">PAWLO</header>
      {error && <p className="feed-error">{error}</p>}
      {loading ? (
        <Spinner />
      ) : (
        <section className="report-grid" aria-label="Lost pet reports">
          {reports.map((r) => <ReportCard key={r.id} report={r} />)}
        </section>
      )}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </main>
  );
}

// ── Search Screen ─────────────────────────────────────────────────────────────

function SearchScreen({ onTabChange }: { onTabChange: (t: Tab) => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('Search');
  const [query, setQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [districtFilter, setDistrictFilter] = useState('All');
  const [results, setResults] = useState<PetReport[]>([]);
  const [loading, setLoading] = useState(true);

  const debouncedQuery = useDebounce(query, 400);

  const loadResults = useCallback(async () => {
    setLoading(true);
    const filters: ReportFilters = {
      query: debouncedQuery,
      species: speciesFilter,
      status: statusFilter,
      district: districtFilter,
    };

    if (!supabase) {
      // Client-side filter on static data
      const q = debouncedQuery.toLowerCase();
      const filtered = STATIC_REPORTS.filter((r) => {
        const mQ = !q || r.name.toLowerCase().includes(q) || r.location.toLowerCase().includes(q) || r.species.toLowerCase().includes(q);
        const mSp = speciesFilter === 'All' || r.species === speciesFilter;
        const mSt = statusFilter === 'All' || r.status === statusFilter;
        const mD = districtFilter === 'All' || r.district === districtFilter;
        return mQ && mSp && mSt && mD;
      });
      setResults(filtered);
      setLoading(false);
      return;
    }

    try {
      const data = await fetchReports(filters);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, speciesFilter, statusFilter, districtFilter]);

  useEffect(() => { loadResults(); }, [loadResults]);

  const handleTabChange = (t: Tab) => { setActiveTab(t); onTabChange(t); };

  return (
    <main className="app-shell search-screen">
      {/* Search Bar */}
      <div className="search-bar-wrap">
        <label className="search-bar" aria-label="Search reports">
          <Search size={17} strokeWidth={2.2} className="search-bar-icon" />
          <input
            type="search"
            placeholder="Search reports..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="search-filter-btn" aria-label="Advanced filters">
          <SlidersHorizontal size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Filter Row */}
      <div className="filter-row">
        {[
          { value: speciesFilter, setter: setSpeciesFilter, opts: ['Species', 'Cat', 'Dog', 'Bird', 'Other'] },
          { value: statusFilter,  setter: setStatusFilter,  opts: ['Status', 'LOST', 'FOUND'] },
          { value: districtFilter, setter: setDistrictFilter, opts: ['District', 'Kandy', 'Colombo', 'Gampaha', 'Matara', 'Galle', 'Kurunegala', 'Ratnapura', 'Anuradhapura', 'Trincomalee', 'Jaffna', 'Other'] },
        ].map(({ value, setter, opts }) => (
          <label key={opts[0]} className="filter-select-wrap">
            <select value={value} onChange={(e) => setter(e.target.value)}>
              {opts.map((o, i) => (
                <option key={o} value={i === 0 ? 'All' : o}>{o}</option>
              ))}
            </select>
            <span className="filter-chevron">&#9660;</span>
          </label>
        ))}
      </div>

      {/* Results */}
      <section className="search-results" aria-label="Search results">
        {loading ? (
          <Spinner />
        ) : results.length === 0 ? (
          <p className="search-empty">No reports match your search.</p>
        ) : (
          results.map((r) => (
            <article className="search-card" key={r.id}>
              <img
                src={r.image_url ?? 'https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg?auto=compress&cs=tinysrgb&h=200&w=200'}
                alt={`${r.name} the ${r.species}`}
                className="search-card-img"
              />
              <div className="search-card-info">
                <strong className="search-card-name">{r.name} / {r.species}</strong>
                <span className="search-card-location">
                  <MapPin size={11} strokeWidth={2.2} />
                  {r.location}
                </span>
              </div>
              <span className={`search-card-badge ${r.status === 'FOUND' ? 'badge-found' : 'badge-lost'}`}>
                {r.status}
              </span>
            </article>
          ))
        )}
      </section>

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </main>
  );
}

// ── Report Screen ─────────────────────────────────────────────────────────────

type ReportScreenProps = { onTabChange: (t: Tab) => void; userId: string | null };

function ReportScreen({ onTabChange, userId }: ReportScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Report');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [petName, setPetName] = useState('');
  const [species, setSpecies] = useState('');
  const [location, setLocation] = useState('');
  const [district, setDistrict] = useState('');
  const [contact, setContact] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleTabChange = (t: Tab) => { setActiveTab(t); onTabChange(t); };

  const handlePhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');

    // Client-side validation for required fields (avoids empty API calls and
    // surfaces friendly errors before any network or storage work).
    const validation =
      requiredError('Pet Name', petName) ??
      requiredError('Species', species) ??
      requiredError('Location', location) ??
      requiredError('District', district) ??
      requiredError('Contact Number', contact) ??
      (isValidPhone(contact) ? null : 'Please enter a valid phone number (at least 8 digits).');
    if (validation) {
      setErrorMsg(validation);
      return;
    }

    if (photoFile && photoFile.size > 10 * 1024 * 1024) {
      setErrorMsg('Photo is too large. Maximum size is 10 MB.');
      return;
    }

    if (!supabase) {
      // Preview mode — simulate success
      setSubmitted(true);
      return;
    }

    if (!userId) {
      setErrorMsg('You must be logged in to submit a report.');
      return;
    }

    setSubmitting(true);
    try {
      // Double-check the active session matches the userId in React state
      // before writing to the DB — defends against stale state after logout
      // or a React race where state was set to a different user's ID.
      const session = await getSession();
      const activeUserId = session?.user?.id ?? null;
      if (!activeUserId || activeUserId !== userId) {
        throw new Error('Session mismatch. Please log in again and retry.');
      }

      let imageUrl: string | null = null;
      if (photoFile) {
        imageUrl = await uploadPetImage(photoFile, activeUserId);
      }

      const newReport: NewReport = {
        user_id: activeUserId,
        name: petName.trim(),
        species: species.trim(),
        location: location.trim(),
        district: district.trim(),
        contact: contact.trim(),
        description: description.trim() || null,
        status: 'LOST',
        image_url: imageUrl,
      };

      await submitReport(newReport);
      setSubmitted(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPetName('');
    setSpecies('');
    setLocation('');
    setDistrict('');
    setContact('');
    setDescription('');
    setSubmitted(false);
    setErrorMsg('');
  };

  return (
    <main className="app-shell report-screen">
      <div className="report-topbar">
        <button className="back-button" onClick={() => handleTabChange('Home')} aria-label="Go home">
          <ArrowLeft size={21} />
        </button>
        <h1 className="report-title">Report Lost Pet</h1>
      </div>

      {submitted ? (
        <div className="report-success">
          <PawPrint size={60} strokeWidth={1.6} className="report-success-icon" />
          <h2>Report Submitted!</h2>
          <p>Your lost pet report has been posted. We hope you reunite soon.</p>
          <button className="submit-report-btn" style={{ width: 'auto', padding: '0 28px' }} onClick={handleReset}>
            Submit Another
          </button>
        </div>
      ) : (
        <form className="report-form" onSubmit={handleSubmit}>
          {/* Photo Upload */}
          <button
            type="button"
            className="photo-upload-area"
            onClick={() => fileRef.current?.click()}
            aria-label="Add pet photo"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Pet preview" className="photo-preview" />
            ) : (
              <>
                <Camera size={34} strokeWidth={1.5} className="photo-upload-icon" />
                <span>Add Photo</span>
              </>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />

          <input className="report-input" type="text" placeholder="Pet Name" value={petName} onChange={(e) => setPetName(e.target.value)} required />

          <div className="report-select-wrap">
            <select className="report-select" value={species} onChange={(e) => setSpecies(e.target.value)} required>
              <option value="" disabled>Species (dog, cat, bird, other)</option>
              <option value="Dog">Dog</option>
              <option value="Cat">Cat</option>
              <option value="Bird">Bird</option>
              <option value="Other">Other</option>
            </select>
            <ChevronDown size={15} strokeWidth={2.2} className="report-select-chevron" />
          </div>

          <input className="report-input" type="text" placeholder="Last Seen Location" value={location} onChange={(e) => setLocation(e.target.value)} required />

          <div className="report-select-wrap">
            <select className="report-select" value={district} onChange={(e) => setDistrict(e.target.value)} required>
              <option value="" disabled>District</option>
              {['Kandy', 'Colombo', 'Gampaha', 'Matara', 'Galle', 'Kurunegala', 'Ratnapura', 'Anuradhapura', 'Trincomalee', 'Jaffna', 'Other'].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <ChevronDown size={15} strokeWidth={2.2} className="report-select-chevron" />
          </div>

          <input className="report-input" type="tel" placeholder="Contact Number" value={contact} onChange={(e) => setContact(e.target.value)} required />

          <textarea className="report-textarea" placeholder="Description / Note" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />

          {errorMsg && <p className="form-message" role="alert">{errorMsg}</p>}

          <button className="submit-report-btn" type="submit" disabled={submitting}>
            {submitting ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Loader2 size={16} className="spinner" /> Submitting...
              </span>
            ) : 'Submit Report'}
          </button>
        </form>
      )}

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </main>
  );
}

// ── My Reports Screen ─────────────────────────────────────────────────────────

type MyReportsScreenProps = { onTabChange: (t: Tab) => void; userId: string | null };

function MyReportsScreen({ onTabChange, userId }: MyReportsScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('My Reports');
  const [reports, setReports] = useState<PetReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId || !supabase) { setReports([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchMyReports(userId);
      setReports(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleTabChange = (t: Tab) => { setActiveTab(t); onTabChange(t); };

  const handleMarkFound = async (id: string) => {
    try {
      await updateReportStatus(id, 'FOUND');
      setReports((prev) => prev.map((r) => r.id === id ? { ...r, status: 'FOUND' } : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update report status.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this report?')) return;
    try {
      await deleteReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete report.');
    }
  };

  return (
    <main className="app-shell search-screen">
      <header className="home-header">My Reports</header>

      {!supabase && (
        <p className="search-empty">Connect Supabase to manage your own reports.</p>
      )}
      {!userId && supabase && (
        <p className="search-empty">Log in to view your reports.</p>
      )}

      {loading && supabase && userId && <Spinner />}
      {error && <p className="feed-error">{error}</p>}

      {!loading && supabase && userId && (
        <section className="search-results" aria-label="My reports">
          {reports.length === 0 ? (
            <p className="search-empty">You haven&apos;t submitted any reports yet.</p>
          ) : (
            reports.map((r) => (
              <article className="search-card" key={r.id}>
                <img
                  src={r.image_url ?? 'https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg?auto=compress&cs=tinysrgb&h=200&w=200'}
                  alt={`${r.name} the ${r.species}`}
                  className="search-card-img"
                />
                <div className="search-card-info">
                  <strong className="search-card-name">{r.name} / {r.species}</strong>
                  <span className="search-card-location">
                    <MapPin size={11} strokeWidth={2.2} /> {r.location}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                  <span className={`search-card-badge ${r.status === 'FOUND' ? 'badge-found' : 'badge-lost'}`}>
                    {r.status}
                  </span>
                  {r.status === 'LOST' && (
                    <button
                      className="myreport-action-btn found-btn"
                      onClick={() => handleMarkFound(r.id)}
                      title="Mark as Found"
                    >
                      Found!
                    </button>
                  )}
                  <button
                    className="myreport-action-btn delete-btn"
                    onClick={() => handleDelete(r.id)}
                    title="Delete report"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </main>
  );
}

// ── Profile Screen ────────────────────────────────────────────────────────────

type ProfileScreenProps = {
  onTabChange: (t: Tab) => void;
  userEmail: string | null;
  onLogout: () => void;
};

function ProfileScreen({ onTabChange, userEmail, onLogout }: ProfileScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Profile');
  const [loggingOut, setLoggingOut] = useState(false);

  const handleTabChange = (t: Tab) => { setActiveTab(t); onTabChange(t); };

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut();
    onLogout();
  };

  return (
    <main className="app-shell search-screen">
      <header className="home-header">Profile</header>

      <div className="profile-card">
        <div className="profile-avatar">
          <UserRound size={38} strokeWidth={1.6} />
        </div>
        <div className="profile-info">
          <p className="profile-email">{userEmail ?? 'Guest'}</p>
          <p className="profile-sub">{supabase ? 'Supabase connected ✓' : 'Preview mode — Supabase not configured'}</p>
        </div>
      </div>

      <button
        className="logout-btn"
        onClick={handleLogout}
        disabled={loggingOut}
      >
        <LogOut size={16} strokeWidth={2} />
        {loggingOut ? 'Signing out...' : 'Sign Out'}
      </button>

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </main>
  );
}

// ── App Root ──────────────────────────────────────────────────────────────────

function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [tab, setTab] = useState<Tab>('Home');
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Auth form state
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // After splash: check for an existing session to skip login
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const session = await getSession();
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
        setScreen('home');
      } else {
        setScreen('start');
      }
    }, 1600);
    return () => window.clearTimeout(timer);
  }, []);

  // Listen for auth state changes (e.g. token refresh)
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
      } else {
        setUserId(null);
        setUserEmail(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const goTo = (s: Screen) => {
    setMessage('');
    setShowPassword(false);
    // Clear all auth fields when navigating between auth screens so that
    // a) values from signup don't leak into login, and b) the form is in
    // a clean state no matter how the user arrives at the screen.
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setIsSubmitting(false);
    setScreen(s);
  };

  const handleTabChange = (t: Tab) => setTab(t);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    try {
      const emailErr = requiredError('Email', email) ?? (isEmail(email) ? null : 'Please enter a valid email address.');
      const passErr = requiredError('Password', password);
      if (emailErr || passErr) {
        setMessage(emailErr ?? passErr ?? '');
        return;
      }
      const user = await signIn(email.trim(), password);
      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? null);
      // Clear credentials from memory after a successful login
      setEmail('');
      setPassword('');
      setScreen('home');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    try {
      const emailErr = requiredError('Email', email) ?? (isEmail(email) ? null : 'Please enter a valid email address.');
      const passErr =
        requiredError('Password', password) ??
        (password.length < 6 ? 'Password must be at least 6 characters.' : null);
      const nameErr = requiredError('Full Name', fullName);
      const phoneErr = requiredError('Phone Number', phone) ?? (isValidPhone(phone) ? null : 'Please enter a valid phone number (at least 8 digits).');
      if (emailErr || passErr || nameErr || phoneErr) {
        setMessage(emailErr ?? passErr ?? nameErr ?? phoneErr ?? '');
        return;
      }
      await signUp(email.trim(), password, { full_name: fullName.trim(), phone: phone.trim() });
      setMessage('Account created! Check your email to confirm, then log in.');
      // Clear PII from state but keep email so the user can log in immediately
      setPassword('');
      setFullName('');
      setPhone('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sign up failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setMessage('');
    if (!email.trim()) {
      setMessage('Enter your email first, then click Forgot Password.');
      return;
    }
    if (!isEmail(email)) {
      setMessage('Please enter a valid email address.');
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPassword(email.trim());
      setMessage('If that email is registered, a password-reset link has been sent.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setUserId(null);
    setUserEmail(null);
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setTab('Home');
    setScreen('start');
  };

  // ── Render home tab ──────────────────────────────────────────
  if (screen === 'home') {
    if (tab === 'Search') return <SearchScreen onTabChange={handleTabChange} />;
    if (tab === 'Report') return <ReportScreen onTabChange={handleTabChange} userId={userId} />;
    if (tab === 'My Reports') return <MyReportsScreen onTabChange={handleTabChange} userId={userId} />;
    if (tab === 'Profile') return <ProfileScreen onTabChange={handleTabChange} userEmail={userEmail} onLogout={handleLogout} />;
    return <HomeScreen onTabChange={handleTabChange} />;
  }

  // ── Splash ───────────────────────────────────────────────────
  if (screen === 'splash') {
    return (
      <main className="app-shell splash-screen">
        <Brand />
        <p>Find. Report. Reunite</p>
      </main>
    );
  }

  // ── Start ────────────────────────────────────────────────────
  if (screen === 'start') {
    return (
      <main className="app-shell start-screen">
        <Brand />
        <div className="start-actions">
          <button className="primary-button" onClick={() => goTo('login')}>Log In</button>
          <button className="primary-button" onClick={() => goTo('signup')}>Sign Up</button>
          <button className="preview-link" onClick={() => { setScreen('home'); setTab('Home'); }}>
            See Home Preview
          </button>
        </div>
      </main>
    );
  }

  // ── Auth (Login / Signup) ────────────────────────────────────
  const isLogin = screen === 'login';

  return (
    <main className="app-shell auth-screen">
      <button className="back-button" onClick={() => goTo('start')} aria-label="Back to welcome screen">
        <ArrowLeft size={21} />
      </button>
      <Brand compact />
      <h1>{isLogin ? 'Welcome' : 'Create Account'}</h1>

      <form onSubmit={isLogin ? handleLogin : handleSignup} className="auth-form">
        {!isLogin && (
          <Field icon={UserRound} placeholder="Full Name" value={fullName} onChange={setFullName} />
        )}
        <Field icon={Mail} type="email" placeholder="Email" value={email} onChange={setEmail} />
        {!isLogin && (
          <Field icon={Phone} type="tel" placeholder="Phone Number" value={phone} onChange={setPhone} />
        )}
        <Field
          icon={LockKeyhole}
          type={showPassword ? 'text' : 'password'}
          placeholder="Password"
          value={password}
          onChange={setPassword}
          right={
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
        />
        {isLogin && (
          <button
            type="button"
            className="forgot-button"
            onClick={handleForgotPassword}
          >
            Forgot Password?
          </button>
        )}
        <button className="primary-button submit-button" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Loader2 size={16} className="spinner" /> Please wait...</span>
            : isLogin ? 'Log In' : 'Sign Up'}
        </button>
      </form>

      {message && <p className="form-message" role="status">{message}</p>}
      <p className="switch-prompt">
        {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
        <button onClick={() => goTo(isLogin ? 'signup' : 'login')}>
          {isLogin ? 'Sign Up' : 'Log In'}
        </button>
      </p>
    </main>
  );
}

export default App;
