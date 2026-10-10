'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const pageSize = 10;

type User = { id: string; email: string; displayName?: string | null; roles?: string[] };
type SectionKey = 'users' | 'employees' | 'vehicles' | 'rides' | 'payments' | 'wallet-transactions' | 'documents' | 'ratings' | 'audit-logs';
type Row = Record<string, any>;
type PageResult = { items: Row[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type HealthState = { status: 'checking' | 'healthy' | 'unavailable'; checkedAt: string | null };
type UserFormValue = { email: string; password: string; displayName: string; phoneNumber: string; role: 'CUSTOMER' | 'ADMIN' };
type UserEditValue = { displayName: string | null; phoneNumber: string | null };
type VehicleFormValue = { registrationNumber: string; capacity: string; make: string; model: string };

const sections: Array<{ key: SectionKey; label: string }> = [
  { key: 'users', label: 'Users' }, { key: 'employees', label: 'Employees & drivers' }, { key: 'vehicles', label: 'Vehicles' },
  { key: 'rides', label: 'Rides' }, { key: 'payments', label: 'Payments' }, { key: 'wallet-transactions', label: 'Wallet transactions' },
  { key: 'documents', label: 'Documents' }, { key: 'ratings', label: 'Ratings & reviews' }, { key: 'audit-logs', label: 'Audit logs' },
];

const columns: Record<SectionKey, Array<{ label: string; get: (row: Row) => string }>> = {
  users: [{ label: 'User', get: (r) => r.displayName || r.email }, { label: 'Email', get: (r) => r.email }, { label: 'Roles', get: (r) => (r.roles ?? []).join(', ') }, { label: 'Status', get: (r) => r.status }, { label: 'Created', get: (r) => date(r.createdAt) }],
  employees: [{ label: 'Employee', get: (r) => r.employeeCode }, { label: 'Name', get: (r) => r.user?.displayName || '—' }, { label: 'Status', get: (r) => r.status }, { label: 'Driver', get: (r) => r.driverStatus }, { label: 'Availability', get: (r) => r.availability }],
  vehicles: [{ label: 'Registration', get: (r) => r.registrationNumber }, { label: 'Vehicle', get: (r) => [r.make, r.model].filter(Boolean).join(' ') || '—' }, { label: 'Capacity', get: (r) => String(r.capacity) }, { label: 'Status', get: (r) => r.status }, { label: 'Assigned', get: (r) => r.assignedEmployee?.employeeCode || 'Unassigned' }],
  rides: [{ label: 'Route', get: (r) => `${r.pickupAddress} → ${r.destinationAddress}` }, { label: 'Scheduled', get: (r) => date(r.scheduledAt) }, { label: 'Status', get: (r) => r.status }, { label: 'Customer', get: (r) => r.requestedByCustomer?.user?.displayName || r.requestedByCustomer?.user?.email || '—' }, { label: 'Fare', get: (r) => r.finalFare || r.estimatedFare ? `${r.currency} ${r.finalFare || r.estimatedFare}` : '—' }],
  payments: [{ label: 'Customer', get: (r) => r.user?.displayName || r.user?.email || '—' }, { label: 'Reference', get: (r) => r.referenceId }, { label: 'Amount', get: (r) => `${r.currency} ${r.amount}` }, { label: 'Status', get: (r) => r.status }, { label: 'Created', get: (r) => date(r.createdAt) }],
  'wallet-transactions': [{ label: 'User', get: (r) => r.wallet?.user?.displayName || r.wallet?.user?.email || '—' }, { label: 'Type', get: (r) => `${r.type} / ${r.direction}` }, { label: 'Amount', get: (r) => `${r.currency} ${r.amount}` }, { label: 'Reference', get: (r) => r.referenceId }, { label: 'Created', get: (r) => date(r.createdAt) }],
  documents: [{ label: 'Document', get: (r) => `${r.resource || ''} ${r.documentType}`.trim() }, { label: 'Owner', get: (r) => r.employee?.employeeCode || r.vehicle?.registrationNumber || '—' }, { label: 'Status', get: (r) => r.status }, { label: 'Expires', get: (r) => date(r.expiresAt) }, { label: 'Created', get: (r) => date(r.createdAt) }],
  ratings: [{ label: 'Ride', get: (r) => r.rideId }, { label: 'Score', get: (r) => `${r.score}/5` }, { label: 'Status', get: (r) => r.status }, { label: 'Rater', get: (r) => r.rater?.displayName || r.rater?.email || '—' }, { label: 'Review', get: (r) => r.reviewText || '—' }],
  'audit-logs': [{ label: 'Action', get: (r) => r.action }, { label: 'Entity', get: (r) => `${r.entityType} · ${r.entityId}` }, { label: 'Actor', get: (r) => r.actor?.displayName || r.actor?.email || 'System' }, { label: 'Created', get: (r) => date(r.createdAt) }],
};

function date(value: unknown) { return value ? new Date(String(value)).toLocaleString() : '—'; }

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.text()) || `Request failed (${response.status})`);
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export default function AdminDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    request<{ accessToken: string; user: User }>('/auth/refresh', '', { method: 'POST' }).then((result) => { if (!result.user.roles?.includes('ADMIN')) throw new Error('Administrator access required'); setToken(result.accessToken); setUser(result.user); }).catch(() => undefined);
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault(); setAuthError('');
    try {
      const result = await request<{ accessToken: string; user: User }>('/auth/login', '', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (!result.user.roles?.includes('ADMIN')) throw new Error('This account does not have administrator access.');
      setToken(result.accessToken); setUser(result.user);
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Unable to sign in'); }
  }

  if (!token || !user) return <main className="auth-shell"><div className="auth-card"><span className="eyebrow">CARPOOLING / ADMIN</span><h1>Operations console</h1><p className="muted">Sign in with an administrator account to continue.</p><form onSubmit={login} className="auth-form"><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{authError && <div className="error-box">{authError}</div>}<button className="primary-button" type="submit">Sign in</button></form></div></main>;
  return <Dashboard token={token} user={user} onLogout={() => { request('/auth/logout', '', { method: 'POST' }).catch(() => undefined); setToken(null); setUser(null); }} />;
}

function Dashboard({ token, user, onLogout }: { token: string; user: User; onLogout: () => void }) {
  const [section, setSection] = useState<SectionKey | null>(null);
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!token) return;
    const socket: Socket = io(`${apiBase}/realtime`, { auth: { accessToken: token }, transports: ['websocket'] });
    const refreshAll = () => setTick((t) => t + 1);
    socket.on('connect', () => console.log('admin realtime connected'));
    socket.on('employee.updated', refreshAll);
    socket.on('vehicle.assigned', refreshAll);
    socket.on('driver.offer', refreshAll);
    socket.on('offer.accepted', refreshAll);
    socket.on('ride.requested', refreshAll);
    socket.on('disconnect', () => console.log('admin realtime disconnected'));
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [token]);
  async function refreshOverview() {
    if (refreshing) return;
    setRefreshing(true); setError('');
    try { const [overviewResult, analyticsResult] = await Promise.all([request<Record<string, number>>('/admin/overview', token), request<any>('/admin/analytics', token)]); setOverview(overviewResult); setAnalytics(analyticsResult); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load overview'); }
    finally { setRefreshing(false); }
  }
  useEffect(() => { void refreshOverview(); }, [token, tick]);
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">C</span><div><strong>Carpooling</strong><small>Operations</small></div></div><nav><button className={!section ? 'nav-item active' : 'nav-item'} onClick={() => setSection(null)}>Overview</button>{sections.map((item) => <button key={item.key} className={section === item.key ? 'nav-item active' : 'nav-item'} onClick={() => setSection(item.key)}>{item.label}</button>)}</nav><button className="logout" onClick={onLogout}>Sign out</button></aside><section className="content"><header className="topbar"><div><span className="eyebrow">ADMINISTRATOR</span><h1>{section ? sections.find((item) => item.key === section)?.label : 'Dashboard overview'}</h1></div><div className="user-chip"><span>{(user.displayName || user.email).slice(0, 1).toUpperCase()}</span>{user.displayName || user.email}</div></header>{error && <div className="error-box">{error}</div>}{section ? <DataSection token={token} section={section} tick={tick} /> : <Overview data={overview} analytics={analytics} refreshing={refreshing} onRefresh={() => void refreshOverview()} />}</section></main>;
}

function Overview(props: { data: Record<string, number> | null; analytics: any; health?: HealthState; refreshing?: boolean; onRefresh?: () => void }) { return <><HealthIndicator /><OverviewContent {...props} /></>; }

function OverviewContent({ data, analytics, refreshing, onRefresh }: { data: Record<string, number> | null; analytics: any; health?: HealthState; refreshing?: boolean; onRefresh?: () => void }) {
  const cards = [['users', 'Users'], ['employees', 'Employees'], ['drivers', 'Active drivers'], ['vehicles', 'Vehicles'], ['activeRides', 'Active rides'], ['payments', 'Payments'], ['pendingDocuments', 'Pending documents'], ['ratings', 'Ratings']];
  if (!data) return <Loading />;
  return <><div className="welcome-panel"><div><span className="eyebrow">LIVE OPERATIONS</span><h2>Keep the network moving.</h2><p className="muted">Monitor people, vehicles, rides, payments, and compliance from one place.</p></div><div className="pulse"><i />Operational status is shown above</div></div><div className="overview-actions"><button className="secondary-button" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh overview'}</button></div><div className="metric-grid">{cards.map(([key, label]) => <div className="metric-card" key={key}><span>{label}</span><strong>{data[key] ?? 0}</strong><small>Current total</small></div>)}</div>{analytics && <div className="analytics-panel"><div className="section-heading"><div><span className="eyebrow">LAST 30 DAYS</span><h2>Operational analytics</h2></div><span className="analytics-period">{new Date(analytics.period.from).toLocaleDateString()} — {new Date(analytics.period.to).toLocaleDateString()}</span></div><div className="analytics-grid"><div><span>Total rides</span><strong>{analytics.rides.total}</strong></div><div><span>Completed</span><strong>{analytics.rides.completed}</strong></div><div><span>Cancelled</span><strong>{analytics.rides.cancelled}</strong></div><div><span>Driver utilization</span><strong>{analytics.drivers.utilizationPercent}%</strong></div><div><span>Avg matching</span><strong>{analytics.averages.matchingTimeMinutes ?? '—'} min</strong></div><div><span>Avg ride duration</span><strong>{analytics.averages.rideDurationMinutes ?? '—'} min</strong></div><div><span>Ratings</span><strong>{analytics.ratings.averageScore} / 5</strong></div><div><span>Recurring usage</span><strong>{analytics.recurringRideUsage.usagePercent}%</strong></div></div><div className="analytics-foot"><span>Revenue {Object.entries(analytics.finance.revenueByCurrency).map(([currency, value]) => `${currency} ${value}`).join(' · ') || '—'}</span><span>Refunds {Object.entries(analytics.finance.refundsByCurrency).map(([currency, value]) => `${currency} ${value}`).join(' · ') || '—'}</span><span>{analytics.recurringRideUsage.generatedOccurrences} generated recurring rides</span></div></div>}<div className="overview-grid"><div className="info-card"><span className="eyebrow">AUDITABILITY</span><h3>{data.auditLogs ?? 0} recorded events</h3><p className="muted">Every important operational action remains visible in the audit log.</p></div><div className="info-card accent"><span className="eyebrow">NEXT</span><h3>Review pending documents</h3><p className="muted">Use the documents view to verify or reject driver and vehicle submissions.</p></div></div></>;
}

function DataSection({ token, section, tick }: { token: string; section: SectionKey; tick?: number }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<PageResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [userModal, setUserModal] = useState<{ mode: 'create' | 'edit'; row?: Row } | null>(null);
  const [vehicleModal, setVehicleModal] = useState<{ mode: 'create' | 'edit'; row?: Row } | null>(null);

  useEffect(() => { setPage(1); setSubmittedSearch(''); setStatus(''); setFrom(''); setTo(''); }, [section]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(submittedSearch ? { search: submittedSearch } : {}), ...(status ? { status } : {}), ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}), ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}) });
      const result = await request<PageResult>(`/admin/${section}?${query}`, token);
      setData(result);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [token, section, page, submittedSearch, tick]);

  const heading = useMemo(() => sections.find((item) => item.key === section)?.label, [section]);

  async function reviewEmployee(employeeId: string, decision: 'APPROVE' | 'REJECT') {
    // open confirmation modal
    setModal({ open: true, employeeId, decision });
  }

  async function doReview(employeeId: string, decision: 'APPROVE' | 'REJECT') {
    try {
      await request(`/employees/${employeeId}/driver-review`, token, { method: 'POST', body: JSON.stringify({ decision, note: `Admin ${decision} via UI` }) });
      addToast({ type: 'success', message: `Driver ${decision.toLowerCase()}d` });
      await loadData();
    } catch (e) { addToast({ type: 'error', message: e instanceof Error ? e.message : 'Action failed' }); }
    setModal({ open: false });
  }

  async function saveUser(value: UserFormValue | UserEditValue, mode: 'create' | 'edit', userId?: string) {
    try {
      await request(mode === 'create' ? '/admin/users' : `/admin/users/${userId}`, token, { method: mode === 'create' ? 'POST' : 'PATCH', body: JSON.stringify(value) });
      addToast({ type: 'success', message: mode === 'create' ? 'User created' : 'User updated' });
      setUserModal(null);
      await loadData();
    } catch (error) { addToast({ type: 'error', message: error instanceof Error ? error.message : 'User save failed' }); }
  }
  async function saveVehicle(value: VehicleFormValue, mode: 'create' | 'edit', vehicleId?: string) {
    try { await request(mode === 'create' ? '/vehicles' : `/vehicles/${vehicleId}`, token, { method: mode === 'create' ? 'POST' : 'PATCH', body: JSON.stringify({ registrationNumber: value.registrationNumber, capacity: Number(value.capacity), make: value.make || null, model: value.model || null }) }); addToast({ type: 'success', message: mode === 'create' ? 'Vehicle registered' : 'Vehicle updated' }); setVehicleModal(null); await loadData(); }
    catch (error) { addToast({ type: 'error', message: error instanceof Error ? error.message : 'Vehicle save failed' }); }
  }

  // simple modal state
  const [modal, setModal] = useState<{ open: boolean; employeeId?: string; decision?: 'APPROVE' | 'REJECT' }>({ open: false });

  // toasts
  type Toast = { id: string; type: 'success' | 'error' | 'info'; message: string };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  function addToast(t: Omit<Toast, 'id'>) {
    const id = `t${++toastId.current}`;
    setToasts((s) => [...s, { id, ...t }]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 5000);
  }

  return <>{/* main panel */}
    <div className="data-panel">
      <div className="panel-toolbar">
        <div>
          <h2>{heading}</h2>
          <p className="muted">Live operational data from the backend.</p>
        </div>
        <form className="search-form" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmittedSearch(search.trim()); }}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" />
          {section !== 'audit-logs' && <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="SUSPENDED">Suspended</option><option value="PENDING">Pending</option><option value="OPEN">Open</option><option value="PROCESSING">Processing</option><option value="COMPLETED">Completed</option><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option><option value="FAILED">Failed</option></select>}
          {section === 'audit-logs' && <><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From date" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To date" /></>}
          <button type="submit">Search</button>{section === 'users' && <button type="button" className="primary-button" onClick={() => setUserModal({ mode: 'create' })}>Add user</button>}{section === 'vehicles' && <button type="button" className="primary-button" onClick={() => setVehicleModal({ mode: 'create' })}>Register vehicle</button>}
        </form>
      </div>
      {error && <div className="error-box">{error}</div>}
      {loading ? <Loading /> : !data?.items.length ? <div className="empty-state"><strong>No records found</strong><span>Try a different search or check back later.</span></div> : <>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns[section].map((column) => <th key={column.label}>{column.label}</th>)}
                {['users', 'employees', 'vehicles', 'rides', 'documents', 'ratings'].includes(section) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => section === 'employees' ? <EmployeeRow key={row.id} row={row} token={token} onChanged={loadData} onReview={reviewEmployee} /> : <DataRow key={`${row.resource || section}-${row.id}`} row={row} section={section} token={token} onChanged={loadData} onEditUser={(selected) => setUserModal({ mode: 'edit', row: selected })} onEditVehicle={(selected) => setVehicleModal({ mode: 'edit', row: selected })} />)}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>Page {data.pagination.page} of {Math.max(1, data.pagination.totalPages)} · {data.pagination.total} records</span>
          <div>
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <button disabled={page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>
      </>}</div>
    <Modal modal={modal} onConfirm={doReview} onCancel={() => setModal({ open: false })} />
    {userModal && <UserModal mode={userModal.mode} row={userModal.row} onCancel={() => setUserModal(null)} onSave={saveUser} />}
    {vehicleModal && <VehicleModal mode={vehicleModal.mode} row={vehicleModal.row} onCancel={() => setVehicleModal(null)} onSave={saveVehicle} />}
    <Toasts toasts={toasts} />
  </>;
}

function DataRow({ row, section, token, onChanged, onEditUser, onEditVehicle }: { row: Row; section: SectionKey; token: string; onChanged: () => Promise<void>; onEditUser: (row: Row) => void; onEditVehicle: (row: Row) => void }) {
  const [busy, setBusy] = useState(false);
  async function mutate(path: string, body?: unknown) {
    setBusy(true);
    try { await request(path, token, { method: body ? 'PATCH' : 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }); await onChanged(); }
    catch (error) { window.alert(error instanceof Error ? error.message : 'Action failed'); }
    finally { setBusy(false); }
  }
  async function verifyDocument(status: 'VERIFIED' | 'REJECTED') {
    const rejectionReason = status === 'REJECTED' ? window.prompt('Rejection reason')?.trim() : undefined;
    if (status === 'REJECTED' && !rejectionReason) return;
    if (!window.confirm(`${status === 'VERIFIED' ? 'Approve' : 'Reject'} this document?`)) return;
    setBusy(true);
    try {
      await request(`/documents/${row.resource}/${row.id}/verification`, token, { method: 'PATCH', body: JSON.stringify({ status, ...(rejectionReason ? { rejectionReason } : {}) }) });
      await onChanged();
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Document update failed'); }
    finally { setBusy(false); }
  }
  async function reviewReport(reportId: string, status: 'DISMISSED' | 'REVIEWED') {
    if (!window.confirm(`${status === 'DISMISSED' ? 'Dismiss' : 'Hide'} this rating report?`)) return;
    setBusy(true);
    try { await request(`/ratings/reports/${reportId}`, token, { method: 'PATCH', body: JSON.stringify({ status }) }); await onChanged(); } catch (error) { window.alert(error instanceof Error ? error.message : 'Report update failed'); } finally { setBusy(false); }
  }
  async function toggleUser() { await mutate(`/admin/users/${row.id}/status`, { status: row.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }); }
  async function toggleVehicle() { const next = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'; await mutate(`/vehicles/${row.id}/status`, { status: next }); }
  async function cancelRide() { if (window.confirm('Cancel this ride?')) await mutate(`/rides/${row.id}/transition`, { status: 'CANCELLED', cancellationReason: 'Cancelled by administrator' }); }
  return <tr>{columns[section].map((column) => <td key={column.label}>{column.get(row)}</td>)}
    {['users', 'vehicles', 'rides', 'documents', 'ratings'].includes(section) && <td className="action-row">
      {section === 'users' && row.status !== 'DELETED' && <><button className="secondary-button small" disabled={busy} onClick={() => onEditUser(row)}>Edit</button><button className="secondary-button small" disabled={busy} onClick={toggleUser}>{row.status === 'ACTIVE' ? 'Suspend' : 'Activate'}</button></>}
      {section === 'vehicles' && row.status !== 'RETIRED' && <><button className="secondary-button small" disabled={busy} onClick={() => onEditVehicle(row)}>Edit</button><button className="secondary-button small" disabled={busy} onClick={toggleVehicle}>{row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></>}
      {section === 'rides' && !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(row.status) && <button className="secondary-button small" disabled={busy} onClick={cancelRide}>Cancel ride</button>}
      {section === 'documents' && <>{row.status === 'PENDING' && <><button className="primary-button small" disabled={busy} onClick={() => verifyDocument('VERIFIED')}>Approve</button><button className="secondary-button small" disabled={busy} onClick={() => verifyDocument('REJECTED')}>Reject</button></>}{row.uploadedAt && <button className="secondary-button small" disabled={busy} onClick={async () => { const result = await request<{ url: string }>(`/documents/${row.resource}/${row.id}/access-url`, token); window.open(result.url, '_blank', 'noopener,noreferrer'); }}>Open</button>}</>}
      {section === 'ratings' && (row.reports || []).map((report: Row) => <span key={report.id}><button className="secondary-button small" disabled={busy} onClick={() => reviewReport(report.id, 'DISMISSED')}>Dismiss report</button><button className="secondary-button small" disabled={busy} onClick={() => reviewReport(report.id, 'REVIEWED')}>Hide rating</button></span>)}
    </td>}
  </tr>;
}

function EmployeeRow({ row, token, onChanged, onReview }: { row: Row; token: string; onChanged: () => Promise<void>; onReview: (employeeId: string, decision: 'APPROVE' | 'REJECT') => void }) {
  const [docsOk, setDocsOk] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/employees/${row.id}/documents`, { credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { if (mounted) setDocsOk(false); return; }
        const docs = await res.json();
        const required = ['DRIVING_LICENSE', 'IDENTITY'];
        const ok = required.every((type) => docs.some((d: any) => d.documentType === type && d.status === 'VERIFIED'));
        if (mounted) setDocsOk(ok);
      } catch { if (mounted) setDocsOk(false); }
    })();
    return () => { mounted = false; };
  }, [row.id, token]);
  return (
    <tr>
      {columns['employees'].map((column) => (
        <td key={column.label}>{column.get(row)}</td>
      ))}
      <td>
        {row.driverStatus === 'ACTIVE' ? (
          <span className="status-pill approved">Approved</span>
        ) : (
          docsOk === false ? (
            <button className="primary-button small" disabled>Awaiting documents</button>
          ) : docsOk === null ? (
            <button className="secondary-button small" disabled>Checking…</button>
          ) : (
            <>
              <button className="primary-button small" onClick={() => onReview(row.id, 'APPROVE')}>Approve</button>
              <button className="secondary-button small" onClick={() => onReview(row.id, 'REJECT')}>Reject</button>
            </>
          )
        )}
        <button className="secondary-button small" onClick={async () => { await request(`/employees/${row.id}/status`, token, { method: 'PATCH', body: JSON.stringify({ status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) }); await onChanged(); }}>{row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
        {row.driverStatus === 'ACTIVE' && <button className="secondary-button small" onClick={async () => { await request(`/employees/${row.id}/driver-status`, token, { method: 'PATCH', body: JSON.stringify({ status: 'INACTIVE' }) }); await onChanged(); }}>Disable driver</button>}
      </td>
    </tr>
  );
}

// Modal and toast rendering at module level for DataSection
function Modal({ modal, onConfirm, onCancel }: { modal: { open: boolean; employeeId?: string; decision?: 'APPROVE' | 'REJECT' }; onConfirm: (id: string, decision: 'APPROVE' | 'REJECT') => void; onCancel: () => void }) {
  if (!modal.open) return null;
  return <div className="modal-backdrop"><div className="modal-card"><h3>Confirm</h3><p>Are you sure you want to {modal.decision?.toLowerCase()} this driver?</p><div className="action-row"><button className="primary-button" onClick={() => modal.employeeId && onConfirm(modal.employeeId, modal.decision!)}>Yes</button><button className="secondary-button" onClick={onCancel}>Cancel</button></div></div></div>;
}

function VehicleModal({ mode, row, onCancel, onSave }: { mode: 'create' | 'edit'; row?: Row; onCancel: () => void; onSave: (value: VehicleFormValue, mode: 'create' | 'edit', vehicleId?: string) => Promise<void> }) {
  const [value, setValue] = useState<VehicleFormValue>({ registrationNumber: row?.registrationNumber ?? '', capacity: String(row?.capacity ?? ''), make: row?.make ?? '', model: row?.model ?? '' });
  const [error, setError] = useState('');
  function update(key: keyof VehicleFormValue, next: string) { setValue((current) => ({ ...current, [key]: next })); }
  async function submit(event: FormEvent) { event.preventDefault(); if (!value.registrationNumber.trim() || !Number.isInteger(Number(value.capacity)) || Number(value.capacity) < 1) { setError('Registration and a positive whole-number capacity are required.'); return; } await onSave(value, mode, row?.id); }
  return <div className="modal-backdrop"><div className="modal-card"><h2>{mode === 'create' ? 'Register vehicle' : 'Edit vehicle'}</h2><form className="auth-form" onSubmit={submit}><label>Registration number<input value={value.registrationNumber} onChange={(event) => update('registrationNumber', event.target.value.toUpperCase())} required maxLength={30} /></label><label>Capacity<input type="number" min="1" max="100" step="1" value={value.capacity} onChange={(event) => update('capacity', event.target.value)} required /></label><label>Make<input value={value.make} onChange={(event) => update('make', event.target.value)} /></label><label>Model<input value={value.model} onChange={(event) => update('model', event.target.value)} /></label>{error && <div className="error-box">{error}</div>}<div className="action-row"><button className="primary-button" type="submit">Save</button><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div></form></div></div>;
}

function HealthIndicator() {
  const [status, setStatus] = useState<HealthState['status']>('checking');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  async function check() { setStatus('checking'); try { await request('/health/ready', ''); setStatus('healthy'); } catch { setStatus('unavailable'); } finally { setCheckedAt(new Date().toISOString()); } }
  useEffect(() => { void check(); const timer = window.setInterval(() => void check(), 30_000); return () => window.clearInterval(timer); }, []);
  return <div className="action-row"><div className="pulse"><i />{status === 'checking' ? 'Checking system…' : status === 'healthy' ? 'System healthy' : 'System unavailable'}</div><button className="secondary-button small" onClick={() => void check()} disabled={status === 'checking'}>{status === 'checking' ? 'Checking…' : 'Refresh'}</button>{checkedAt && <small className="muted">{date(checkedAt)}</small>}</div>;
}

export function UserModal({ mode, row, onCancel, onSave }: { mode: 'create' | 'edit'; row?: Row; onCancel: () => void; onSave: (value: UserFormValue | UserEditValue, mode: 'create' | 'edit', userId?: string) => Promise<void> }) {
  const [value, setValue] = useState<UserFormValue>({ email: row?.email ?? '', password: '', displayName: row?.displayName ?? '', phoneNumber: row?.phoneNumber ?? '', role: row?.roles?.includes('ADMIN') ? 'ADMIN' : 'CUSTOMER' });
  const [error, setError] = useState('');
  function update(key: keyof UserFormValue, next: string) { setValue((current) => ({ ...current, [key]: next })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (mode === 'create' && (!value.email || value.password.length < 12)) { setError('Email and a password of at least 12 characters are required.'); return; }
    if (mode === 'create') await onSave(value, mode);
    else await onSave({ displayName: value.displayName || null, phoneNumber: value.phoneNumber || null }, mode, row?.id);
  }
  return <div className="modal-backdrop"><div className="modal-card"><h2>{mode === 'create' ? 'Create user' : 'Edit user'}</h2><form className="auth-form" onSubmit={submit}>{mode === 'create' && <><label>Email<input type="email" value={value.email} onChange={(event) => update('email', event.target.value)} required /></label><label>Temporary password<input type="password" minLength={12} value={value.password} onChange={(event) => update('password', event.target.value)} required /></label><label>Role<select value={value.role} onChange={(event) => update('role', event.target.value as UserFormValue['role'])}><option value="CUSTOMER">Customer</option><option value="ADMIN">Administrator</option></select></label></>}<label>Display name<input value={value.displayName} onChange={(event) => update('displayName', event.target.value)} /></label><label>Phone number<input value={value.phoneNumber} onChange={(event) => update('phoneNumber', event.target.value)} pattern="^\\+?[1-9]\\d{7,14}$" /></label>{error && <div className="error-box">{error}</div>}<div className="action-row"><button className="primary-button" type="submit">Save</button><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div></form></div></div>;
}

function Toasts({ toasts }: { toasts: { id: string; type: string; message: string }[] }) {
  return <div style={{ position: 'fixed', right: 12, top: 12, zIndex: 1000 }}>{toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}</div>;
}

function Loading() { return <div className="loading-state"><span className="spinner" />Loading data…</div>; }
