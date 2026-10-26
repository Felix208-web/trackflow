
import { apiRequest } from "./api";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  ownerId: string;
  _count?: {
    boards: number;
  };
}

interface ProjectsResponse {
  projects: Project[];
}

interface CreateProjectResponse {
  project: Project;
}

export async function getProjects(): Promise<Project[]> {
  const data = await apiRequest<ProjectsResponse>("/projects");
  return data.projects;
}

export async function createProject(
  name: string,
  description: string,
): Promise<Project> {
  const data = await apiRequest<CreateProjectResponse>("/projects", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });

  return data.project;
}
