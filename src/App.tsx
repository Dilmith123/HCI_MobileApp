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
  CheckCircle,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Home,
  Loader2,
  LogOut,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  PawPrint,
  Pencil,
  Phone,
  PhoneCall,
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
  uploadAvatar,
  updateReportStatus,
  updateReport,
  deleteReport,
  fetchProfile,
  updateProfile,
} from '@/lib/api';
import type { PetReport, NewReport, Profile, ReportFilters } from '@/types/database';

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

/**
 * Normalise a phone number string for use in WhatsApp wa.me links.
 *
 * Rules applied in order:
 *  1. Strip all whitespace, hyphens, parentheses, and dots.
 *  2. Remove a leading `+` (wa.me does not use it).
 *  3. For Sri Lankan mobile numbers that start with `07` (local format),
 *     replace the leading `0` with `94` (country code).
 *  4. Return the resulting digit-only international string, or null if
 *     the input is empty / too short to be a real number.
 */
function normalizePhone(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  // Strip formatting characters
  let n = raw.replace(/[\s\-().+]/g, '');
  // Sri Lankan local format: 07xxxxxxxx → 947xxxxxxxx
  if (n.startsWith('0') && n.length >= 9) {
    n = '94' + n.slice(1);
  }
  // Must be at least 7 digits to be meaningful
  if (!/^\d{7,}$/.test(n)) return null;
  return n;
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
      <img
        src="/images/pawlo-logo.png"
        alt="PAWLo Logo"
        className="brand-paw-img"
      />
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

function ReportCard({ report, onClick }: { report: PetReport; onClick?: () => void }) {
  return (
    <article
      className={`report-card${onClick ? ' report-card-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-label={onClick ? `View details for ${report.name}` : undefined}
    >
      <img
        src={report.image_url ?? 'https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg?auto=compress&cs=tinysrgb&h=200&w=200'}
        alt={`${report.name} the ${report.species}`}
      />
      <div className="report-details">
        <strong>{report.name}</strong>
        <span>{report.location}</span>
        <span>{fmtDate(report.created_at)}</span>
        <b className={report.status === 'FOUND' ? 'badge-found' : 'badge-lost'}>{report.status}</b>
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
  const [selectedReport, setSelectedReport] = useState<PetReport | null>(null);

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

  // If a report is selected, show the public detail screen
  if (selectedReport) {
    return (
      <PublicReportDetailScreen
        report={selectedReport}
        onBack={() => setSelectedReport(null)}
        onTabChange={handleTabChange}
      />
    );
  }

  return (
    <main className="app-shell home-screen">
      <header className="home-header">PAWLO</header>
      {error && <p className="feed-error">{error}</p>}
      {loading ? (
        <Spinner />
      ) : (
        <section className="report-grid" aria-label="Lost pet reports">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              onClick={() => setSelectedReport(r)}
            />
          ))}
        </section>
      )}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </main>
  );
}

// ── Public Report Detail Screen ───────────────────────────────────────────────
// View-only. No Edit / Delete / Mark-as-Found.
// Call and WhatsApp buttons use the report's contact field.

type PublicReportDetailProps = {
  report: PetReport;
  onBack: () => void;
  onTabChange: (t: Tab) => void;
  activeTab?: Tab;
};

function PublicReportDetailScreen({
  report,
  onBack,
  onTabChange,
  activeTab = 'Home',
}: PublicReportDetailProps) {
  const isLost = report.status === 'LOST';
  const PLACEHOLDER = 'https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

  // Normalised number for wa.me and tel: links
  const phoneNorm = normalizePhone(report.contact ?? '');
  const hasContact = !!phoneNorm;

  const handleCall = () => {
    if (!hasContact) return;
    window.open(`tel:${report.contact!.trim()}`, '_self');
  };

  const handleWhatsApp = () => {
    if (!hasContact) return;
    window.open(`https://wa.me/${phoneNorm}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="app-shell detail-screen">
      {/* Top bar */}
      <div className="detail-topbar">
        <button className="back-button" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={21} />
        </button>
        <span className="detail-topbar-title">PAWLO</span>
      </div>

      {/* Hero image */}
      <div className="detail-hero-wrap">
        <img
          src={report.image_url ?? PLACEHOLDER}
          alt={`${report.name} the ${report.species}`}
          className="detail-hero-img"
        />
      </div>

      {/* Name + badge */}
      <div className="detail-name-row">
        <h1 className="detail-pet-name">{report.name}</h1>
        <span className={`detail-status-badge ${isLost ? 'badge-lost' : 'badge-found'}`}>
          {report.status}
        </span>
      </div>

      {/* Location */}
      <div className="detail-location-row">
        <MapPin size={14} strokeWidth={2.2} className="detail-loc-icon" />
        <span className="detail-location-text">
          {report.district ? `${report.location}, ${report.district}` : report.location}
        </span>
      </div>

      {/* Info block */}
      <div className="detail-info-block">
        <div className="detail-info-row">
          <span className="detail-info-label">Species:</span>
          <span className="detail-info-val">{report.species}</span>
        </div>
        <div className="detail-info-row">
          <span className="detail-info-label">Date Reported:</span>
          <span className="detail-info-val">{fmtDate(report.created_at)}</span>
        </div>
        {report.contact && (
          <div className="detail-info-row">
            <span className="detail-info-label">Contact:</span>
            <span className="detail-info-val">{report.contact}</span>
          </div>
        )}
        {report.description && (
          <div className="detail-info-row detail-info-desc">
            <span className="detail-info-label">Description:</span>
            <span className="detail-info-val detail-desc-text">{report.description}</span>
          </div>
        )}
      </div>

      {/* Call + WhatsApp action buttons */}
      <div className="pub-detail-actions">
        <button
          className={`pub-detail-btn pub-detail-call${!hasContact ? ' pub-detail-btn-disabled' : ''}`}
          onClick={handleCall}
          disabled={!hasContact}
          aria-label={hasContact ? `Call ${report.contact}` : 'No contact number available'}
          title={hasContact ? `Call ${report.contact}` : 'No contact number'}
        >
          <PhoneCall size={17} strokeWidth={2.3} />
          Call
        </button>
        <button
          className={`pub-detail-btn pub-detail-whatsapp${!hasContact ? ' pub-detail-btn-disabled' : ''}`}
          onClick={handleWhatsApp}
          disabled={!hasContact}
          aria-label={hasContact ? `WhatsApp ${report.contact}` : 'No contact number available'}
          title={hasContact ? `WhatsApp ${report.contact}` : 'No contact number'}
        >
          <MessageCircle size={17} strokeWidth={2.3} />
          Whatsapp
        </button>
      </div>

      {!hasContact && (
        <p className="pub-detail-no-contact">No contact number provided for this report.</p>
      )}

      <BottomNav activeTab={activeTab} onTabChange={onTabChange} />
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
  const [selectedReport, setSelectedReport] = useState<PetReport | null>(null);

  const debouncedQuery = useDebounce(query, 400);

  const loadResults = useCallback(async () => {
    setLoading(true);
    const cleanedQuery = debouncedQuery.trim().replace(/\s+/g, ' ');
    const filters: ReportFilters = {
      query: cleanedQuery,
      species: speciesFilter,
      status: statusFilter,
      district: districtFilter,
    };

    if (!supabase) {
      // Client-side filter on static data
      const q = cleanedQuery.toLowerCase();
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

  // If a report is selected, display the public detail screen (with Search highlighted on BottomNav)
  if (selectedReport) {
    return (
      <PublicReportDetailScreen
        report={selectedReport}
        onBack={() => setSelectedReport(null)}
        onTabChange={handleTabChange}
        activeTab="Search"
      />
    );
  }

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
          { value: statusFilter, setter: setStatusFilter, opts: ['Status', 'LOST', 'FOUND'] },
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
            <article
              className="search-card report-card-clickable"
              key={r.id}
              onClick={() => setSelectedReport(r)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedReport(r);
                }
              }}
              aria-label={`View details for ${r.name}`}
            >
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

type ReportScreenProps = {
  onTabChange: (t: Tab) => void;
  userId: string | null;
  userPhone?: string | null;
};

function ReportScreen({ onTabChange, userId, userPhone }: ReportScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Report');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [petName, setPetName] = useState('');
  const [species, setSpecies] = useState('');
  const [location, setLocation] = useState('');
  const [district, setDistrict] = useState('');
  const [contact, setContact] = useState(userPhone ?? '');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // If the user's profile has a phone number, pre-fill contact when available
  useEffect(() => {
    if (userPhone && !contact) {
      setContact(userPhone);
    }
  }, [userPhone]);

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
    setContact(userPhone ?? '');
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

// ── Report Detail Screen ───────────────────────────────────────────────────────

type ReportDetailProps = {
  report: PetReport;
  onBack: () => void;
  onTabChange: (t: Tab) => void;
  onMarkFound: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (report: PetReport) => void;
  userId: string | null;
};

function ReportDetailScreen({
  report,
  onBack,
  onTabChange,
  onMarkFound,
  onDelete,
  onEdit,
  userId,
}: ReportDetailProps) {
  const isOwner = !!userId && userId === report.user_id;
  const isLost = report.status === 'LOST';

  return (
    <main className="app-shell detail-screen">
      {/* Top bar */}
      <div className="detail-topbar">
        <button className="back-button" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={21} />
        </button>
        <span className="detail-topbar-title">PAWLO</span>
      </div>

      {/* Hero image */}
      <div className="detail-hero-wrap">
        <img
          src={
            report.image_url ??
            'https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'
          }
          alt={`${report.name} the ${report.species}`}
          className="detail-hero-img"
        />
      </div>

      {/* Name + badge */}
      <div className="detail-name-row">
        <h1 className="detail-pet-name">{report.name}</h1>
        <span className={`detail-status-badge ${isLost ? 'badge-lost' : 'badge-found'}`}>
          {report.status}
        </span>
      </div>

      {/* Location row */}
      <div className="detail-location-row">
        <MapPin size={14} strokeWidth={2.2} className="detail-loc-icon" />
        <span className="detail-location-text">
          {report.district ? `${report.location}, ${report.district}` : report.location}
        </span>
      </div>

      {/* Info block */}
      <div className="detail-info-block">
        <div className="detail-info-row">
          <span className="detail-info-label">Species:</span>
          <span className="detail-info-val">{report.species}</span>
        </div>
        <div className="detail-info-row">
          <span className="detail-info-label">Contact:</span>
          <span className="detail-info-val">{report.contact || '—'}</span>
        </div>
        <div className="detail-info-row">
          <span className="detail-info-label">Date Reported:</span>
          <span className="detail-info-val">{fmtDate(report.created_at)}</span>
        </div>
        {report.description && (
          <div className="detail-info-row detail-info-desc">
            <span className="detail-info-label">Description:</span>
            <span className="detail-info-val detail-desc-text">{report.description}</span>
          </div>
        )}
      </div>

      {/* Action buttons — only for owner */}
      {isOwner && (
        <div className="detail-actions">
          {isLost && (
            <button
              className="detail-btn detail-btn-found"
              onClick={() => onMarkFound(report.id)}
            >
              <CheckCircle size={16} strokeWidth={2.2} />
              Mark as Found
            </button>
          )}
          <div className="detail-btn-row">
            <button
              className="detail-btn detail-btn-edit"
              onClick={() => onEdit(report)}
            >
              <Pencil size={15} strokeWidth={2.2} />
              Edit
            </button>
            <button
              className="detail-btn detail-btn-delete"
              onClick={() => onDelete(report.id)}
            >
              <Trash2 size={15} strokeWidth={2.2} />
              Delete
            </button>
          </div>
        </div>
      )}

      <BottomNav activeTab="My Reports" onTabChange={onTabChange} />
    </main>
  );
}

// ── Edit Report Screen ─────────────────────────────────────────────────────────

type EditReportScreenProps = {
  report: PetReport;
  onBack: () => void;
  onTabChange: (t: Tab) => void;
  onSaved: (updated: PetReport) => void;
  userId: string | null;
};

function EditReportScreen({ report, onBack, onTabChange, onSaved, userId }: EditReportScreenProps) {
  const [petName, setPetName] = useState(report.name);
  const [species, setSpecies] = useState(report.species);
  const [location, setLocation] = useState(report.location);
  const [district, setDistrict] = useState(report.district);
  const [contact, setContact] = useState(report.contact);
  const [description, setDescription] = useState(report.description ?? '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(report.image_url ?? null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');

    const validation =
      requiredError('Pet Name', petName) ??
      requiredError('Species', species) ??
      requiredError('Location', location) ??
      requiredError('District', district) ??
      requiredError('Contact Number', contact) ??
      (isValidPhone(contact) ? null : 'Please enter a valid phone number (at least 8 digits).');
    if (validation) { setErrorMsg(validation); return; }

    if (!userId) { setErrorMsg('You must be logged in to edit a report.'); return; }
    if (photoFile && photoFile.size > 10 * 1024 * 1024) {
      setErrorMsg('Photo is too large. Maximum size is 10 MB.');
      return;
    }

    setSaving(true);
    try {
      let imageUrl = report.image_url;
      if (photoFile) {
        const session = await getSession();
        const activeUserId = session?.user?.id ?? null;
        if (!activeUserId || activeUserId !== userId) {
          throw new Error('Session mismatch. Please log in again and retry.');
        }
        const uploaded = await uploadPetImage(photoFile, activeUserId);
        if (uploaded) imageUrl = uploaded;
      }

      const updated = await updateReport(report.id, {
        name: petName.trim(),
        species: species.trim(),
        location: location.trim(),
        district: district.trim(),
        contact: contact.trim(),
        description: description.trim() || null,
        image_url: imageUrl,
      });
      onSaved(updated);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="app-shell report-screen">
      <div className="report-topbar">
        <button className="back-button" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={21} />
        </button>
        <h1 className="report-title">Edit Report</h1>
      </div>

      <form className="report-form" onSubmit={handleSave}>
        {/* Photo Upload */}
        <button
          type="button"
          className="photo-upload-area"
          onClick={() => fileRef.current?.click()}
          aria-label="Change pet photo"
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

        <input
          className="report-input"
          type="text"
          placeholder="Pet Name"
          value={petName}
          onChange={(e) => setPetName(e.target.value)}
          required
        />

        <div className="report-select-wrap">
          <select
            className="report-select"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            required
          >
            <option value="" disabled>Species (dog, cat, bird, other)</option>
            <option value="Dog">Dog</option>
            <option value="Cat">Cat</option>
            <option value="Bird">Bird</option>
            <option value="Other">Other</option>
          </select>
          <ChevronDown size={15} strokeWidth={2.2} className="report-select-chevron" />
        </div>

        <input
          className="report-input"
          type="text"
          placeholder="Last Seen Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
        />

        <div className="report-select-wrap">
          <select
            className="report-select"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            required
          >
            <option value="" disabled>District</option>
            {['Kandy', 'Colombo', 'Gampaha', 'Matara', 'Galle', 'Kurunegala', 'Ratnapura', 'Anuradhapura', 'Trincomalee', 'Jaffna', 'Other'].map(
              (d) => <option key={d} value={d}>{d}</option>
            )}
          </select>
          <ChevronDown size={15} strokeWidth={2.2} className="report-select-chevron" />
        </div>

        <input
          className="report-input"
          type="tel"
          placeholder="Contact Number"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
        />

        <textarea
          className="report-textarea"
          placeholder="Description / Note"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        {errorMsg && <p className="form-message" role="alert">{errorMsg}</p>}

        <button className="submit-report-btn" type="submit" disabled={saving}>
          {saving ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Loader2 size={16} className="spinner" /> Saving...
            </span>
          ) : 'Save Changes'}
        </button>
      </form>

      <BottomNav activeTab="My Reports" onTabChange={onTabChange} />
    </main>
  );
}

// ── My Reports Screen ─────────────────────────────────────────────────────────

type MyReportsView = 'list' | 'detail' | 'edit';
type MyReportsSection = 'Active' | 'Closed';

type MyReportsScreenProps = { onTabChange: (t: Tab) => void; userId: string | null };

function MyReportsScreen({ onTabChange, userId }: MyReportsScreenProps) {
  const [navTab, setNavTab] = useState<Tab>('My Reports');
  const [section, setSection] = useState<MyReportsSection>('Active');
  const [view, setView] = useState<MyReportsView>('list');
  const [selectedReport, setSelectedReport] = useState<PetReport | null>(null);
  const [reports, setReports] = useState<PetReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId || !supabase) { setReports([]); setLoading(false); return; }
    setLoading(true);
    setError('');
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

  const handleTabChange = (t: Tab) => { setNavTab(t); onTabChange(t); };

  // ── Actions ──
  const handleMarkFound = async (id: string) => {
    try {
      await updateReportStatus(id, 'FOUND');
      setReports((prev) => prev.map((r) => r.id === id ? { ...r, status: 'FOUND' } : r));
      if (selectedReport?.id === id) {
        setSelectedReport((r) => r ? { ...r, status: 'FOUND' } : r);
      }
      // Move to Closed section and back to list after marking found
      setSection('Closed');
      setView('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update report.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return;
    try {
      await deleteReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      setView('list');
      setSelectedReport(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete report.');
    }
  };

  const handleOpenDetail = (r: PetReport) => {
    setSelectedReport(r);
    setView('detail');
  };

  const handleOpenEdit = (r: PetReport) => {
    setSelectedReport(r);
    setView('edit');
  };

  const handleEditSaved = (updated: PetReport) => {
    setReports((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    setSelectedReport(updated);
    setView('detail');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedReport(null);
  };

  const handleBackToDetail = () => {
    setView('detail');
  };

  // ── Sub-view: Detail ──
  if (view === 'detail' && selectedReport) {
    return (
      <ReportDetailScreen
        report={selectedReport}
        onBack={handleBackToList}
        onTabChange={handleTabChange}
        onMarkFound={handleMarkFound}
        onDelete={handleDelete}
        onEdit={handleOpenEdit}
        userId={userId}
      />
    );
  }

  // ── Sub-view: Edit ──
  if (view === 'edit' && selectedReport) {
    return (
      <EditReportScreen
        report={selectedReport}
        onBack={handleBackToDetail}
        onTabChange={handleTabChange}
        onSaved={handleEditSaved}
        userId={userId}
      />
    );
  }

  // ── Sub-view: List ──
  const activeReports = reports.filter((r) => r.status === 'LOST');
  const closedReports = reports.filter((r) => r.status === 'FOUND');
  const shown = section === 'Active' ? activeReports : closedReports;

  const PLACEHOLDER = 'https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg?auto=compress&cs=tinysrgb&h=200&w=200';

  return (
    <main className="app-shell myreports-screen">
      <header className="myreports-header">
        <button className="back-button myreports-back" onClick={() => handleTabChange('Home')} aria-label="Go home">
          <ArrowLeft size={21} />
        </button>
        <span className="myreports-title">My Reports</span>
      </header>

      {/* Active / Closed tabs */}
      <div className="myreports-tabs">
        <button
          className={`myreports-tab${section === 'Active' ? ' myreports-tab-active' : ''}`}
          onClick={() => setSection('Active')}
        >
          Active
        </button>
        <button
          className={`myreports-tab${section === 'Closed' ? ' myreports-tab-closed-active' : ''}`}
          onClick={() => setSection('Closed')}
        >
          Closed
        </button>
      </div>

      {!supabase && (
        <p className="search-empty">Connect Supabase to manage your own reports.</p>
      )}
      {!userId && supabase && (
        <p className="search-empty">Log in to view your reports.</p>
      )}

      {loading && supabase && userId && <Spinner />}
      {error && <p className="feed-error">{error}</p>}

      {!loading && supabase && userId && (
        <section className="myreports-list" aria-label={`${section} reports`}>
          {shown.length === 0 ? (
            <div className="myreports-empty">
              <FileText size={40} strokeWidth={1.4} className="myreports-empty-icon" />
              <p>
                {section === 'Active'
                  ? 'No active reports. Create a lost report to get started.'
                  : 'No closed reports yet.'}
              </p>
            </div>
          ) : (
            shown.map((r) => (
              <article
                key={r.id}
                className="myreports-card"
                onClick={() => handleOpenDetail(r)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleOpenDetail(r)}
                aria-label={`View details for ${r.name}`}
              >
                <img
                  src={r.image_url ?? PLACEHOLDER}
                  alt={`${r.name} the ${r.species}`}
                  className="myreports-card-img"
                />
                <div className="myreports-card-info">
                  <strong className="myreports-card-name">{r.name} / {r.species}</strong>
                  <span className="myreports-card-location">
                    <MapPin size={11} strokeWidth={2.2} />
                    {r.district || r.location}
                  </span>
                  <div className="myreports-card-actions">
                    <button
                      className="myreports-icon-btn"
                      title="Edit report"
                      onClick={(e) => { e.stopPropagation(); handleOpenEdit(r); }}
                      aria-label="Edit report"
                    >
                      <Pencil size={14} strokeWidth={2.2} />
                    </button>
                    <button
                      className="myreports-icon-btn myreports-icon-btn-delete"
                      title="Delete report"
                      onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                      aria-label="Delete report"
                    >
                      <Trash2 size={14} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
                <span className={`search-card-badge ${r.status === 'FOUND' ? 'badge-found' : 'badge-lost'}`}>
                  {r.status}
                </span>
              </article>
            ))
          )}
        </section>
      )}

      <BottomNav activeTab={navTab} onTabChange={handleTabChange} />
    </main>
  );
}

// ── Profile Screen ────────────────────────────────────────────────────────────

type ProfileScreenProps = {
  onTabChange: (t: Tab) => void;
  userId: string | null;
  userEmail: string | null;
  profile: Profile | null;
  onProfileUpdate: (updated: Profile) => void;
  onLogout: () => void;
  onGoToLogin: () => void;
};

function ProfileScreen({
  onTabChange,
  userId,
  userEmail,
  profile,
  onProfileUpdate,
  onLogout,
  onGoToLogin,
}: ProfileScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Profile');
  const [isEditing, setIsEditing] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const editAvatarRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setEditFullName(profile.full_name ?? '');
      setEditPhone(profile.phone ?? '');
      setEditAddress(profile.address ?? '');
      setEditAvatarPreview(profile.avatar_url ?? null);
    }
  }, [profile]);

  const handleTabChange = (t: Tab) => {
    setActiveTab(t);
    onTabChange(t);
  };

  const handleStartEdit = () => {
    setStatusMsg(null);
    setEditFullName(profile?.full_name ?? '');
    setEditPhone(profile?.phone ?? '');
    setEditAddress(profile?.address ?? '');
    setEditAvatarFile(null);
    setEditAvatarPreview(profile?.avatar_url ?? null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setStatusMsg(null);
    setEditFullName(profile?.full_name ?? '');
    setEditPhone(profile?.phone ?? '');
    setEditAddress(profile?.address ?? '');
    setEditAvatarFile(null);
    setEditAvatarPreview(profile?.avatar_url ?? null);
    setIsEditing(false);
  };

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setEditAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setStatusMsg(null);

    const nameErr = requiredError('Full Name', editFullName);
    const phoneErr = editPhone.trim()
      ? (isValidPhone(editPhone) ? null : 'Please enter a valid phone number (at least 8 digits).')
      : null;
    const addressErr = requiredError('Address', editAddress);
    if (nameErr || phoneErr || addressErr) {
      setStatusMsg({ type: 'error', text: nameErr ?? phoneErr ?? addressErr ?? '' });
      return;
    }

    setSaving(true);
    try {
      let avatarUrl = profile?.avatar_url ?? null;
      if (editAvatarFile) {
        const uploadedUrl = await uploadAvatar(editAvatarFile, userId);
        if (uploadedUrl) avatarUrl = uploadedUrl;
      }

      const updated = await updateProfile(userId, {
        full_name: editFullName.trim(),
        phone: editPhone.trim() || null,
        address: editAddress.trim() || null,
        avatar_url: avatarUrl,
      });
      onProfileUpdate(updated);
      setIsEditing(false);
      setStatusMsg({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update profile.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut();
    onLogout();
  };

  return (
    <main className="app-shell profile-screen">
      {!userId ? (
        <div className="profile-guest-card">
          <div className="profile-avatar">
            <UserRound size={36} strokeWidth={1.8} />
          </div>
          <strong style={{ fontSize: 15, color: '#0d1110' }}>Guest User</strong>
          <p style={{ margin: 0, fontSize: 12, color: '#6a7870' }}>
            Log in to manage your profile and view your reports.
          </p>
          <button
            className="primary-button"
            style={{ width: '100%', marginTop: 8 }}
            onClick={onGoToLogin}
          >
            Log In / Sign Up
          </button>
        </div>
      ) : (
        <>
          {/* Circular Avatar */}
          <div className="profile-figma-avatar-wrap">
            <img
              src={
                profile?.avatar_url ||
                'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&h=300&w=300'
              }
              alt={profile?.full_name || 'User avatar'}
              className="profile-figma-avatar"
            />
          </div>

          {/* User Name & Dynamic Address Subtitle */}
          <h1 className="profile-figma-name">
            {profile?.full_name?.trim() ? profile.full_name : 'John Doe'}
          </h1>
          <p className="profile-figma-location">
            {profile?.address?.trim() ? profile.address : 'Colombo, Western Province'}
          </p>

          {statusMsg && (
            <p
              className={statusMsg.type === 'success' ? 'profile-success-msg' : 'feed-error'}
              role="alert"
            >
              {statusMsg.text}
            </p>
          )}

          {isEditing ? (
            <form className="profile-form" onSubmit={handleSaveProfile}>
              {/* Avatar Selector in Edit Mode */}
              <div
                className="profile-edit-avatar-wrap"
                onClick={() => editAvatarRef.current?.click()}
                title="Change photo"
              >
                <img
                  src={
                    editAvatarPreview ||
                    profile?.avatar_url ||
                    'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&h=300&w=300'
                  }
                  alt="Preview"
                  className="profile-figma-avatar"
                />
                <div className="profile-edit-avatar-overlay">
                  <Camera size={18} />
                  <span>Change</span>
                </div>
              </div>
              <input
                ref={editAvatarRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleAvatarChange}
              />

              <Field
                icon={UserRound}
                placeholder="Full Name"
                value={editFullName}
                onChange={setEditFullName}
              />
              <Field
                icon={Phone}
                type="tel"
                placeholder="Phone Number"
                value={editPhone}
                onChange={setEditPhone}
              />
              <Field
                icon={MapPin}
                placeholder="Address (e.g. Colombo, Western Province)"
                value={editAddress}
                onChange={setEditAddress}
              />
              <div className="profile-btn-row">
                <button
                  type="submit"
                  className="profile-save-btn"
                  disabled={saving}
                >
                  {saving ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Loader2 size={14} className="spinner" /> Saving...
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </button>
                <button
                  type="button"
                  className="profile-cancel-btn"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Green Edit Profile Pill Button */}
              <button
                type="button"
                className="profile-figma-edit-btn"
                onClick={handleStartEdit}
              >
                Edit Profile
              </button>

              {/* 3-Row Figma Info Card */}
              <div className="profile-figma-card">
                <div className="profile-figma-row">
                  <Phone size={20} className="profile-figma-icon" strokeWidth={2.4} />
                  <span className="profile-figma-val">
                    {profile?.phone?.trim() ? profile.phone : '+94 712710482'}
                  </span>
                </div>

                <div className="profile-figma-row">
                  <Mail size={20} className="profile-figma-icon" strokeWidth={2.4} />
                  <span className="profile-figma-val">{userEmail ?? 'john@gmail.com'}</span>
                </div>

                <div className="profile-figma-row">
                  <MapPin size={20} className="profile-figma-icon" strokeWidth={2.4} />
                  <span className="profile-figma-val">
                    {profile?.address?.trim() ? profile.address : 'Colombo'}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Sign Out Button */}
          <button
            className="logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut size={16} strokeWidth={2} />
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </>
      )}

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
  const [profile, setProfile] = useState<Profile | null>(null);

  // Auth form state
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [signupAvatarFile, setSignupAvatarFile] = useState<File | null>(null);
  const [signupAvatarPreview, setSignupAvatarPreview] = useState<string | null>(null);
  const signupAvatarRef = useRef<HTMLInputElement>(null);
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
        setProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch profile whenever userId is authenticated
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    fetchProfile(userId)
      .then((p) => {
        if (!cancelled && p) setProfile(p);
      })
      .catch((err) => {
        console.error('Failed to load profile:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
    setAddress('');
    setSignupAvatarFile(null);
    setSignupAvatarPreview(null);
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
      const addrErr = requiredError('Address', address);
      if (emailErr || passErr || nameErr || phoneErr || addrErr) {
        setMessage(emailErr ?? passErr ?? nameErr ?? phoneErr ?? addrErr ?? '');
        return;
      }
      if (signupAvatarFile && signupAvatarFile.size > 10 * 1024 * 1024) {
        setMessage('Profile photo is too large. Maximum size is 10 MB.');
        return;
      }

      const data = await signUp(email.trim(), password, {
        full_name: fullName.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });

      if (data.session && data.user) {
        // If an avatar file was provided, upload it and update profile
        if (signupAvatarFile) {
          try {
            const avatarUrl = await uploadAvatar(signupAvatarFile, data.user.id);
            if (avatarUrl) {
              await updateProfile(data.user.id, { avatar_url: avatarUrl });
            }
          } catch (uploadErr) {
            console.error('Failed to upload signup avatar:', uploadErr);
          }
        }

        setUserId(data.user.id);
        setUserEmail(data.user.email ?? null);
        setEmail('');
        setPassword('');
        setFullName('');
        setPhone('');
        setAddress('');
        setSignupAvatarFile(null);
        setSignupAvatarPreview(null);
        setScreen('home');
      } else {
        setMessage('Account created. Please confirm your email, then log in.');
        // Clear sensitive fields but keep email if login is required
        setPassword('');
        setFullName('');
        setPhone('');
        setAddress('');
        setSignupAvatarFile(null);
        setSignupAvatarPreview(null);
      }
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
    setProfile(null);
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setAddress('');
    setSignupAvatarFile(null);
    setSignupAvatarPreview(null);
    setTab('Home');
    setScreen('start');
  };

  // ── Render home tab ──────────────────────────────────────────
  if (screen === 'home') {
    if (tab === 'Search') return <SearchScreen onTabChange={handleTabChange} />;
    if (tab === 'Report') return <ReportScreen onTabChange={handleTabChange} userId={userId} userPhone={profile?.phone} />;
    if (tab === 'My Reports') return <MyReportsScreen onTabChange={handleTabChange} userId={userId} />;
    if (tab === 'Profile') return (
      <ProfileScreen
        onTabChange={handleTabChange}
        userId={userId}
        userEmail={userEmail}
        profile={profile}
        onProfileUpdate={setProfile}
        onLogout={handleLogout}
        onGoToLogin={() => goTo('login')}
      />
    );
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
          <>
            <button
              type="button"
              className="signup-avatar-picker"
              onClick={() => signupAvatarRef.current?.click()}
              aria-label="Add profile photo"
            >
              {signupAvatarPreview ? (
                <img src={signupAvatarPreview} alt="Avatar preview" className="signup-avatar-preview" />
              ) : (
                <>
                  <Camera size={24} strokeWidth={1.8} />
                  <span className="signup-avatar-label">Add Photo</span>
                </>
              )}
            </button>
            <input
              ref={signupAvatarRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSignupAvatarFile(file);
                  const r = new FileReader();
                  r.onload = () => setSignupAvatarPreview(r.result as string);
                  r.readAsDataURL(file);
                }
              }}
            />
            <Field icon={UserRound} placeholder="Full Name" value={fullName} onChange={setFullName} />
          </>
        )}
        <Field icon={Mail} type="email" placeholder="Email" value={email} onChange={setEmail} />
        {!isLogin && (
          <>
            <Field icon={Phone} type="tel" placeholder="Phone Number" value={phone} onChange={setPhone} />
            <Field icon={MapPin} placeholder="Address (e.g. Colombo, Western Province)" value={address} onChange={setAddress} />
          </>
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
