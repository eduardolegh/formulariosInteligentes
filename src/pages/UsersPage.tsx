import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
type Role = { id: number; key: string; name: string };
type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  department: string;
  is_active: boolean;
  created_at: string;
  user_roles?: Array<{ role: Role | null }>;
};
type UserRole = { user_id: string; role: Role | null };
const initial = {
  email: "",
  password: "",
  fullName: "",
  roleKey: "form_designer",
  department: "",
};
export function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  async function load() {
    const [{ data: p }, { data: r }, { data: ur }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,email,full_name,department,is_active,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("roles").select("id,key,name").order("name"),
      supabase.from("user_roles").select("user_id,role:roles(id,key,name)"),
    ]);
    const map = new Map<string, Array<{ role: Role | null }>>();
    ((ur as unknown as UserRole[]) ?? []).forEach((a) =>
      map.set(a.user_id, [...(map.get(a.user_id) ?? []), { role: a.role }]),
    );
    setProfiles(
      ((p as Profile[]) ?? []).map((x) => ({
        ...x,
        user_roles: map.get(x.id) ?? [],
      })),
    );
    setRoles((r as Role[]) ?? []);
  }
  useEffect(() => {
    void load();
    supabase
      .from("departments")
      .select("name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setDepartments((data ?? []).map((x) => x.name)));
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { error: e1 } = await supabase.functions.invoke("admin-create-user", {
      body: form,
    });
    if (e1) setError(e1.message);
    else {
      setMessage("Usuario creado correctamente.");
      setOpen(false);
      setForm(initial);
      void load();
    }
  }
  async function save() {
    if (!editing) return;
    const { error: e } = await supabase
      .from("profiles")
      .update({
        full_name: editing.full_name,
        department: editing.department,
        is_active: editing.is_active,
      })
      .eq("id", editing.id);
    if (e) setError(e.message);
    else {
      setMessage("Usuario actualizado correctamente.");
      setEditing(null);
      void load();
    }
  }
  async function changePassword() { if (!editing || newPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return } const { error: passwordError } = await supabase.functions.invoke('admin-update-password', { body: { userId: editing.id, password: newPassword } }); if (passwordError) setError(passwordError.message); else { setMessage('Contraseña actualizada correctamente.'); setNewPassword('') } }
  return (
    <section className="module-page">
      <div className="module-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN</p>
          <h1>Usuarios y roles</h1>
          <p>Gestiona perfiles, roles y departamentos.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => setOpen(!open)}
          type="button"
        >
          + Crear usuario
        </button>
      </div>
      {message && <div className="success-banner">{message}</div>}
      {error && <div className="error-banner">{error}</div>}
      {open && (
        <form className="user-form panel" onSubmit={create}>
          <div className="form-grid">
            <label>
              Nombre completo
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </label>
            <label>
              Correo electrónico
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              Contraseña temporal
              <input
                required
                minLength={6}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <label>
              Rol
              <select
                value={form.roleKey}
                onChange={(e) => setForm({ ...form, roleKey: e.target.value })}
              >
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Departamento (Participante)
              <select
                value={form.department}
                onChange={(e) =>
                  setForm({ ...form, department: e.target.value })
                }
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d || "Sin departamento"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button className="primary-button" type="submit">
              Crear usuario
            </button>
          </div>
        </form>
      )}
      {editing && (
        <div className="user-form panel">
          <h2>Editar perfil</h2>
          <div className="form-grid">
            <label>
              Nombre
              <input
                value={editing.full_name}
                onChange={(e) =>
                  setEditing({ ...editing, full_name: e.target.value })
                }
              />
            </label>
            <label>
              Departamento (Participante)
              <select
                value={editing.department}
                onChange={(e) =>
                  setEditing({ ...editing, department: e.target.value })
                }
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d || "Sin departamento"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select
                value={editing.is_active ? "1" : "0"}
                onChange={(e) =>
                  setEditing({ ...editing, is_active: e.target.value === "1" })
                }
              >
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </label>
            <label> Nueva contraseña<input minLength={6} type="password" placeholder="Mínimo 6 caracteres" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
          </div>
          <button
            className="primary-button"
            onClick={() => void save()}
            type="button"
          >
            Guardar cambios
          </button>
          <button className="secondary-button" onClick={() => void changePassword()} type="button">Cambiar contraseña</button>
        </div>
      )}
      <div className="panel users-table-panel">
        <div className="panel-heading">
          <h2>Usuarios registrados</h2>
          <span className="table-count">{profiles.length} usuarios</span>
        </div>
        <div className="users-table">
          <div className="table-row table-header">
            <span>Perfil</span>
            <span>Rol</span>
            <span>Departamento</span>
            <span>Acción</span>
          </div>
          {profiles.map((p) => (
            <div className="table-row" key={p.id}>
              <span>
                <strong>{p.full_name || "Sin nombre"}</strong>
                <small>{p.email || "Sin correo"}</small>
              </span>
              <span>
                {p.user_roles
                  ?.map((a) => a.role?.name)
                  .filter(Boolean)
                  .join(", ") || "Sin rol"}
              </span>
              <span>{p.department || "Sin departamento"}</span>
              <span>
                <button
                  className="text-button"
                  onClick={() => setEditing(p)}
                  type="button"
                >
                  Editar
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
