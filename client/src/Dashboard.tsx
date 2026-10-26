
import { useEffect, useState } from "react";
import "./Dashboard.css";
import { apiRequest } from "./lib/api";
import {
  createProject,
  getProjects,
  type Project,
} from "./lib/projects";

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await apiRequest<{ user: CurrentUser }>("/auth/me");
        setUser(data.user);

        const userProjects = await getProjects();
        setProjects(userProjects);
      } catch {
        window.location.href = "/";
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  async function handleCreateProject(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setCreating(true);

    try {
      const project = await createProject(
        projectName.trim(),
        description.trim(),
      );

      setProjects((current) => [project, ...current]);
      setProjectName("");
      setDescription("");
      setShowForm(false);
      setSuccess("Project created successfully.");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create project.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout() {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  }

  if (loading) {
    return <main className="dashboard-loading">Loading your workspace...</main>;
  }

  return (
    <main className="dashboard">
      <aside className="dashboard-sidebar">
        <a className="dashboard-brand" href="/dashboard">
          <span className="brand-icon">T</span>
          TrackFlow
        </a>

        <p className="sidebar-label">WORKSPACE</p>
        <a className="sidebar-link active" href="/dashboard">
          <span>▦</span> Overview
        </a>
        <a className="sidebar-link" href="#projects">
          <span>▤</span> My Projects
        </a>

        <div className="sidebar-bottom">
          <p className="sidebar-label">YOUR SPACE</p>
          <p className="sidebar-note">
            Your projects and tasks, all in one place.
          </p>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>Overview</h1>
          </div>

          <div className="dashboard-user">
            <span>{user?.name ?? "User"}</span>
            <button
              className="profile-avatar"
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              {user?.name?.charAt(0).toUpperCase() ?? "U"}
            </button>
          </div>
        </header>

        <section className="welcome-section">
          <p className="welcome-label">YOUR TEAM'S WORKSPACE</p>
          <h2>Let's make progress, {user?.name.split(" ")[0] ?? "there"}.</h2>
          <p>
            Organise your work, keep track of tasks, and move
            your projects forward.
          </p>
        </section>

        {error && <p className="dashboard-message error" role="alert">{error}</p>}
        {success && <p className="dashboard-message success" role="status">{success}</p>}

        <section className="dashboard-stats">
          <article className="stat-card">
            <span className="stat-icon">▤</span>
            <p>Total projects</p>
            <h3>{projects.length}</h3>
            <span className="stat-note">Projects you belong to</span>
          </article>

          <article className="stat-card">
            <span className="stat-icon">◷</span>
            <p>Boards created</p>
            <h3>
              {projects.reduce(
                (total, project) => total + (project._count?.boards ?? 0),
                0,
              )}
            </h3>
            <span className="stat-note">Across your projects</span>
          </article>

          <article className="stat-card">
            <span className="stat-icon">✓</span>
            <p>Tasks completed</p>
            <h3>0</h3>
            <span className="stat-note">Task tracking comes next</span>
          </article>
        </section>

        <section className="projects-section" id="projects">
          <div className="section-heading">
            <div>
              <h2>Your projects</h2>
              <p>Keep all your team's work organised.</p>
            </div>

            <button
              className="create-project-button"
              onClick={() => {
                setError("");
                setSuccess("");
                setShowForm((current) => !current);
              }}
            >
              {showForm ? "Cancel" : "+ New project"}
            </button>
          </div>

          {showForm && (
            <form className="project-form" onSubmit={handleCreateProject}>
              <label htmlFor="project-name">Project name</label>
              <input
                id="project-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="e.g. SIWES Team Project"
                minLength={2}
                maxLength={100}
                required
              />

              <label htmlFor="project-description">Description (optional)</label>
              <textarea
                id="project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is this project about?"
                maxLength={500}
                rows={3}
              />

              <button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create project"}
              </button>
            </form>
          )}

          {projects.length === 0 ? (
            <div className="empty-projects">
              <div className="empty-project-icon">＋</div>
              <h3>No projects yet</h3>
              <p>
                Create your first project to start organising
                tasks and collaborating with your team.
              </p>
            </div>
          ) : (
            <div className="project-grid">
              {projects.map((project) => (
                <button
                  className="project-card project-card-button"
                  key={project.id}
                  onClick={() => {
                    window.location.href = `/projects/${project.id}`;
                  }}
                >
                  <div className="project-card-icon">▤</div>
                  <h3>{project.name}</h3>
                  <p>{project.description || "No description provided."}</p>
                  <span className="project-card-meta">
                    {project._count?.boards ?? 0} board(s)
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default Dashboard;
