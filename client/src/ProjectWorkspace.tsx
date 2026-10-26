
import { useEffect, useState } from "react";
import { apiRequest } from "./lib/api";
import "./ProjectWorkspace.css";

interface ProjectMember {
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface TaskAssignee {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  position: number;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: TaskAssignee | null;
}

interface TaskList {
  id: string;
  name: string;
  position: number;
  tasks: Task[];
}

interface Board {
  id: string;
  name: string;
  lists: TaskList[];
}

interface ProjectDetails {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
  boards: Board[];
}

interface ProjectResponse {
  project: ProjectDetails;
}

interface CurrentUserResponse {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface AddMemberResponse {
  message: string;
  member: {
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    joinedAt: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  };
}

function ProjectWorkspace() {
  const projectId = window.location.pathname.split("/")[2] ?? "";

  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskError, setTaskError] = useState("");

  const [isEditingProject, setIsEditingProject] = useState(false);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDescription, setEditProjectDescription] = useState("");

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [taskActionError, setTaskActionError] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<
    "" | "ADMIN" | "MEMBER" | "VIEWER"
  >("");
  const [memberActionError, setMemberActionError] = useState("");
  const [memberActionMessage, setMemberActionMessage] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setError("Invalid project URL.");
      setLoading(false);
      return;
    }

    async function loadProject() {
      try {
        const data = await apiRequest<ProjectResponse>(
          `/projects/${projectId}`,
        );
        setProject(data.project);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load this project.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadProject();
  }, [projectId]);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const data = await apiRequest<CurrentUserResponse>("/auth/me");
        setCurrentUserId(data.user.id);
      } catch (err) {
        console.error("Unable to load the current user:", err);
      }
    }

    void loadCurrentUser();
  }, []);

  const currentUserRole =
    project && currentUserId
      ? project.ownerId === currentUserId
        ? "OWNER"
        : project.members.find(
            (member) => member.user.id === currentUserId,
          )?.role ?? null
      : null;

  const isProjectOwner = currentUserRole === "OWNER";

  const canManageTasks =
    currentUserRole === "OWNER" ||
    currentUserRole === "ADMIN" ||
    currentUserRole === "MEMBER";

  const canManageMembers =
    currentUserRole === "OWNER" || currentUserRole === "ADMIN";

  async function refreshProject() {
    const data = await apiRequest<ProjectResponse>(
      `/projects/${projectId}`,
    );
    setProject(data.project);
  }

  async function handleCreateTask(
    event: React.FormEvent<HTMLFormElement>,
    listId: string,
  ) {
    event.preventDefault();

    const title = newTaskTitle.trim();

    if (!title) {
      setTaskError("Please enter a task title.");
      return;
    }

    setCreatingTask(true);
    setTaskError("");

    try {
      await apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: newTaskDescription.trim() || undefined,
          dueDate: newTaskDueDate || undefined,
          listId,
          assigneeId: newTaskAssigneeId || null,
        }),
      });

      await refreshProject();

      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskDueDate("");
      setNewTaskAssigneeId("");
      setActiveListId(null);
    } catch (err: unknown) {
      setTaskError(
        err instanceof Error ? err.message : "Unable to create task.",
      );
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleAddMember() {
    const email = memberEmail.trim();

    if (!email) {
      setMemberActionError("Enter the email address of the person you want to add.");
      return;
    }

    if (!project) {
      setMemberActionError("Project details are not available yet.");
      return;
    }

    setAddingMember(true);
    setMemberActionError("");
    setMemberActionMessage("");

    try {
      const data = await apiRequest<AddMemberResponse>(
        `/projects/${project.id}/members`,
        {
          method: "POST",
          body: JSON.stringify({ email, role: memberRole }),
        }
      );

      setProject((current) => {
        if (!current) return current;

        // Avoid duplicating the member in the UI.
        if (
          current.members.some(
            (member) => member.user.id === data.member.user.id
          )
        ) {
          return current;
        }

        return {
          ...current,
          members: [...current.members, data.member],
        };
      });

      setMemberEmail("");
      setMemberRole("MEMBER");
      setMemberActionMessage(
        `${data.member.user.name} has been added to the project.`
      );
    } catch (error) {
      setMemberActionError(
        error instanceof Error
          ? error.message
          : "Could not add this member. Please try again."
      );
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(member: ProjectMember) {
    if (!project) return;

    const confirmed = window.confirm(
      `Remove ${member.user.name} from this project?`
    );

    if (!confirmed) return;

    setMemberActionError("");
    setMemberActionMessage("");

    try {
      await apiRequest<{ message: string }>(
        `/projects/${project.id}/members/${member.user.id}`,
        { method: "DELETE" }
      );

      setProject((current) => {
        if (!current) return current;

        return {
          ...current,
          members: current.members.filter(
            (item) => item.user.id !== member.user.id
          ),
          boards: current.boards.map((board) => ({
            ...board,
            lists: board.lists.map((list) => ({
              ...list,
              tasks: list.tasks.map((task) =>
                task.assigneeId === member.user.id
                  ? { ...task, assigneeId: null, assignee: null }
                  : task
              ),
            })),
          })),
        };
      });

      setMemberActionMessage(
        `${member.user.name} has been removed from the project.`
      );
    } catch (error) {
      setMemberActionError(
        error instanceof Error
          ? error.message
          : "Could not remove this member."
      );
    }
  }

  async function handleChangeMemberRole(
    member: ProjectMember,
    role: "ADMIN" | "MEMBER" | "VIEWER",
  ) {
    if (!project || !isProjectOwner) return;

    setMemberActionError("");
    setMemberActionMessage("");

    try {
      const response = await apiRequest<{
        message: string;
        member: ProjectMember;
      }>(
        `/projects/${project.id}/members/${member.user.id}/role`,
        {
          method: "PATCH",
          body: JSON.stringify({ role }),
        },
      );

      setProject((current) =>
        current
          ? {
              ...current,
              members: current.members.map((item) =>
                item.user.id === member.user.id
                  ? response.member
                  : item,
              ),
            }
          : current,
      );

      setMemberActionMessage(
        `${member.user.name}'s role updated successfully.`,
      );
    } catch (error) {
      setMemberActionError(
        error instanceof Error
          ? error.message
          : "Could not change the member's role.",
      );
    }
  }

  async function handleUpdateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project || !isProjectOwner) return;

    try {
      const response = await apiRequest<{
        message: string;
        project: ProjectDetails;
      }>(`/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editProjectName.trim(),
          description: editProjectDescription.trim(),
        }),
      });

      setProject((current) =>
        current
          ? {
              ...current,
              name: response.project.name,
              description: response.project.description,
            }
          : current,
      );

      setIsEditingProject(false);
      setMemberActionMessage("Project details updated successfully.");
      setMemberActionError("");
    } catch (error) {
      setMemberActionError(
        error instanceof Error
          ? error.message
          : "Could not update project details.",
      );
    }
  }

  async function handleUpdateTask(
    event: React.FormEvent<HTMLFormElement>,
    taskId: string,
  ) {
    event.preventDefault();

    const title = editTitle.trim();

    if (!title) {
      setTaskActionError("Task title cannot be empty.");
      return;
    }

    setSavingTask(true);
    setTaskActionError("");

    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          description: editDescription.trim() || null,
          dueDate: editDueDate || null,
          assigneeId: editAssigneeId || null,
        }),
      });

      await refreshProject();
      setEditingTaskId(null);
    } catch (err: unknown) {
      setTaskActionError(
        err instanceof Error ? err.message : "Unable to update task.",
      );
    } finally {
      setSavingTask(false);
    }
  }


  async function handleMoveTask(taskId: string, status: string) {
    const targetList = project?.boards
      .flatMap((board) => board.lists)
      .find((list) => {
        const expectedStatus: Record<string, string> = {
          "To do": "TODO",
          "In progress": "IN_PROGRESS",
          Done: "DONE",
        };

        return expectedStatus[list.name] === status;
      });

    if (!targetList) {
      setTaskActionError("Could not find the destination list.");
      return;
    }

    setTaskActionError("");

    try {
      await apiRequest(`/tasks/${taskId}/move`, {
        method: "PATCH",
        body: JSON.stringify({ listId: targetList.id }),
      });

      await refreshProject();
    } catch (err: unknown) {
      setTaskActionError(
        err instanceof Error ? err.message : "Unable to move task.",
      );
    }
  }


  async function handleDeleteTask(taskId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this task? This cannot be undone.",
    );

    if (!confirmed) return;

    setTaskActionError("");

    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "DELETE",
      });

      if (editingTaskId === taskId) {
        setEditingTaskId(null);
      }

      await refreshProject();
    } catch (err: unknown) {
      setTaskActionError(
        err instanceof Error ? err.message : "Unable to delete task.",
      );
    }
  }

  if (loading) {
    return <main className="workspace-page">Loading project...</main>;
  }

  if (error || !project) {
    return (
      <main className="workspace-page">
        <a href="/dashboard">← Back to dashboard</a>
        <p>{error || "Project not found."}</p>
      </main>
    );
  }

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <a className="workspace-back" href="/dashboard">
          ← Dashboard
        </a>

        <div>
          <p className="workspace-eyebrow">PROJECT WORKSPACE</p>

          {isEditingProject && isProjectOwner ? (
            <form onSubmit={handleUpdateProject} className="edit-project-form">
              <label htmlFor="edit-project-name">Project name</label>
              <input
                id="edit-project-name"
                value={editProjectName}
                onChange={(event) => setEditProjectName(event.target.value)}
                minLength={2}
                maxLength={100}
                required
              />

              <label htmlFor="edit-project-description">Description</label>
              <textarea
                id="edit-project-description"
                value={editProjectDescription}
                onChange={(event) => setEditProjectDescription(event.target.value)}
                maxLength={500}
                rows={3}
              />

              <button type="submit">Save changes</button>
              <button
                type="button"
                onClick={() => setIsEditingProject(false)}
              >
                Cancel
              </button>
            </form>
          ) : (
            <>
              <h1>{project.name}</h1>
              <p className="workspace-description">
                {project.description || "No project description yet."}
              </p>

              {isProjectOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setEditProjectName(project.name);
                    setEditProjectDescription(project.description ?? "");
                    setIsEditingProject(true);
                    setMemberActionError("");
                    setMemberActionMessage("");
                  }}
                >
                  Edit project
                </button>
              )}
            </>
          )}
        </div>
      </header>

            <section className="project-members-panel">
              <div className="project-members-heading">
                <div>
                  <h2>Project members</h2>
                  <p>
                    {project.members.length}{" "}
                    {project.members.length === 1 ? "member" : "members"}
                  </p>
                </div>
              </div>

              {canManageMembers && (
                <form
                  className="add-member-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleAddMember();
                  }}
                >
                  <label htmlFor="member-email">Add an existing user</label>

                  <input
                    id="member-email"
                    type="email"
                    placeholder="Enter their account email"
                    value={memberEmail}
                    onChange={(event) => setMemberEmail(event.target.value)}
                    required
                  />

                  <div className="add-member-controls">
                    <label htmlFor="member-role" className="visually-hidden">
                      Role
                    </label>

                    <select
                      id="member-role"
                      value={memberRole}
                      onChange={(event) =>
                        setMemberRole(
                          event.target.value as "" | "ADMIN" | "MEMBER" | "VIEWER"
                        )
                      }
                      required
                    >
                      <option value="" disabled>
                        Select role
                      </option>
                      <option value="MEMBER">Member — can manage tasks</option>
                      <option value="VIEWER">Viewer — read-only access</option>
                      {isProjectOwner && (
                        <option value="ADMIN">
                          Admin — can manage tasks and add members
                        </option>
                      )}
                    </select>

                    <button type="submit" disabled={addingMember}>
                      {addingMember ? "Adding..." : "Add member"}
                    </button>
                  </div>

                  {memberActionError && (
                    <p className="member-feedback member-feedback-error" role="alert">
                      {memberActionError}
                    </p>
                  )}

                  {memberActionMessage && (
                    <p className="member-feedback member-feedback-success" role="status">
                      {memberActionMessage}
                    </p>
                  )}
                </form>
              )}

              <ul className="project-members-list">
                {project.members.map((member) => (
                  <li key={member.user.id} className="project-member-item">
                    <div className="member-avatar" aria-hidden="true">
                      {member.user.name.trim().charAt(0).toUpperCase()}
                    </div>

                    <div className="member-details">
                      <strong>{member.user.name}</strong>
                      <span>{member.user.email}</span>
                    </div>

                    {isProjectOwner && member.role !== "OWNER" ? (
                      <select
                        value={member.role}
                        onChange={(event) =>
                          handleChangeMemberRole(
                            member,
                            event.target.value as "ADMIN" | "MEMBER" | "VIEWER",
                          )
                        }
                        aria-label={`Change role for ${member.user.name}`}
                        className={`member-role member-role-${member.role.toLowerCase()}`}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    ) : (
                      <span
                        className={`member-role member-role-${member.role.toLowerCase()}`}
                      >
                        {member.role === "OWNER"
                          ? "Owner"
                          : member.role.toLowerCase()}
                      </span>
                    )}

                    {isProjectOwner && member.role !== "OWNER" && (
                      <button
                        type="button"
                        className="remove-member-button"
                        onClick={() => handleRemoveMember(member)}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>

            </section>

      {project.boards.map((board) => (
        <section className="board-section" key={board.id}>
          <h2>{board.name}</h2>

          {taskActionError && (
            <p className="task-form-error">{taskActionError}</p>
          )}

          <div className="task-columns">
            {board.lists.map((list) => (
              <section className="task-column" key={list.id}>
                <div className="task-column-heading">
                  <h3>{list.name}</h3>
                  <span>{list.tasks.length}</span>
                </div>

                {list.tasks.length === 0 ? (
                  <p className="empty-tasks">No tasks yet</p>
                ) : (
                  list.tasks.map((task) => (
                    <article className="task-card" key={task.id}>
                      {editingTaskId === task.id ? (
                        <form
                          className="task-form"
                          onSubmit={(event) =>
                            void handleUpdateTask(event, task.id)
                          }
                        >
                          <input
                            autoFocus
                            value={editTitle}
                            onChange={(event) =>
                              setEditTitle(event.target.value)
                            }
                            placeholder="Task title"
                            maxLength={200}
                            required
                          />

                          <textarea
                            value={editDescription}
                            onChange={(event) =>
                              setEditDescription(event.target.value)
                            }
                            placeholder="Description (optional)"
                            maxLength={2000}
                            rows={3}
                          />

                          <label className="task-assignee-label">
                            Assign to (optional)
                            <select
                              value={editAssigneeId}
                              onChange={(event) => setEditAssigneeId(event.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {project?.members.map((member) => (
                                <option key={member.user.id} value={member.user.id}>
                                  {member.user.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="task-due-date-label">
                            Due date (optional)
                            <input
                              type="date"
                              value={editDueDate}
                              onChange={(event) => setEditDueDate(event.target.value)}
                              onPointerDown={(event) => {
                                const input = event.currentTarget;

                                if (input.disabled || input.readOnly) return;

                                try {
                                  input.showPicker();
                                } catch {
                                  // The browser may already have opened the picker.
                                }
                              }}
                            />
                          </label>

                          {taskActionError && (
                            <p className="task-form-error">
                              {taskActionError}
                            </p>
                          )}

                          <div className="task-form-actions">
                            <button type="submit" disabled={savingTask}>
                              {savingTask ? "Saving..." : "Save"}
                            </button>

                            <button
                              type="button"
                              disabled={savingTask}
                              onClick={() => {
                                setEditingTaskId(null);
                                setTaskActionError("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <h4>{task.title}</h4>

                          {task.description && <p>{task.description}</p>}

                          {task.assignee && (
                            <p className="task-assignee">
                              <span>Assigned to:</span> {task.assignee.name}
                            </p>
                          )}

                          {task.dueDate && (
                            <p className="task-due-date">
                              <span>Due:</span>{" "}
                              {new Date(task.dueDate).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                timeZone: "UTC",
                              })}
                            </p>
                          )}

                          {canManageTasks && (
                          <label className="task-status-label">
                            Status
                            <select
                              value={task.status}
                              onChange={(event) => {
                                void handleMoveTask(task.id, event.target.value);
                              }}
                            >
                              <option value="TODO">To do</option>
                              <option value="IN_PROGRESS">In progress</option>
                              <option value="DONE">Done</option>
                            </select>
                          </label>
                          )}

                          {canManageTasks && (
                          <div className="task-card-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTaskId(task.id);
                                setEditTitle(task.title);
                                setEditDescription(task.description ?? "");
                                setEditDueDate(
                                  task.dueDate ? task.dueDate.slice(0, 10) : "",
                                );
                                setEditAssigneeId(task.assigneeId ?? "");
                                setTaskActionError("");
                              }}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="delete-task-button"
                              onClick={() => void handleDeleteTask(task.id)}
                            >
                              Delete
                            </button>
                          </div>
                          )}
                        </>
                      )}
                    </article>
                  ))
                )}

                {canManageTasks && activeListId === list.id ? (
                  <form
                    className="task-form"
                    onSubmit={(event) =>
                      void handleCreateTask(event, list.id)
                    }
                  >
                    <input
                      autoFocus
                      value={newTaskTitle}
                      onChange={(event) =>
                        setNewTaskTitle(event.target.value)
                      }
                      placeholder="Task title"
                      maxLength={200}
                      required
                    />

                    <textarea
                      value={newTaskDescription}
                      onChange={(event) =>
                        setNewTaskDescription(event.target.value)
                      }
                      placeholder="Description (optional)"
                      maxLength={2000}
                      rows={3}
                    />

                    <label className="task-assignee-label">
                      Assign to (optional)
                      <select
                        value={newTaskAssigneeId}
                        onChange={(event) => setNewTaskAssigneeId(event.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {project?.members.map((member) => (
                          <option key={member.user.id} value={member.user.id}>
                            {member.user.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="task-due-date-label">
                      Due date (optional)
                      <input
                        type="date"
                        value={newTaskDueDate}
                        onChange={(event) => setNewTaskDueDate(event.target.value)}
                      />
                    </label>


                    {taskError && (
                      <p className="task-form-error">{taskError}</p>
                    )}

                    <div className="task-form-actions">
                      <button type="submit" disabled={creatingTask}>
                        {creatingTask ? "Adding..." : "Add task"}
                      </button>

                      <button
                        type="button"
                        disabled={creatingTask}
                        onClick={() => {
                          setActiveListId(null);
                          setTaskError("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : canManageTasks && (
                  <button
                    type="button"
                    className="add-task-button"
                    onClick={() => {
                      setActiveListId(list.id);
                      setNewTaskTitle("");
                      setNewTaskDescription("");
                      setTaskError("");
                    }}
                  >
                    + Add task
                  </button>
                )}
              </section>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

export default ProjectWorkspace;
