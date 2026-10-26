
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
});

const addProjectMemberSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).optional().default("MEMBER"),
});

router.get("/:projectId", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const projectId = req.params.projectId;

  if (typeof projectId !== "string") {
    return res.status(400).json({
      error: "Invalid project ID",
    });
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    },
    select: {
      id: true,
      name: true,
      description: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,

      // Include project members for the assignment dropdown.
      members: {
        orderBy: { joinedAt: "asc" },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },

      boards: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          lists: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              name: true,
              position: true,
              tasks: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  title: true,
                  description: true,
                  status: true,
                  position: true,
                  dueDate: true,
                  assigneeId: true,
                  assignee: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!project) {
    return res.status(404).json({
      error: "Project not found",
    });
  }

  return res.json({ project });
});

router.get("/", requireAuth, async (req, res) => {
  const userId = req.userId!;

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      ownerId: true,
      _count: {
        select: { boards: true },
      },
    },
  });

  return res.json({ projects });
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid project details",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const userId = req.userId!;
  const { name, description } = parsed.data;

  const project = await prisma.project.create({
    data: {
      name,
      description: description || null,
      owner: {
        connect: { id: userId },
      },
      members: {
        create: {
          role: "OWNER",
          user: {
            connect: { id: userId },
          },
        },
      },
      boards: {
        create: {
          name: "Main board",
          lists: {
            create: [
              { name: "To do", position: 0 },
              { name: "In progress", position: 1 },
              { name: "Done", position: 2 },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      ownerId: true,
      boards: {
        select: {
          id: true,
          name: true,
          lists: {
            select: {
              id: true,
              name: true,
              position: true,
            },
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });

  return res.status(201).json({ project });
});

router.post("/:projectId/members", requireAuth, async (req, res) => {
  const ownerId = req.userId!;
  const projectId = req.params.projectId;

  if (typeof projectId !== "string") {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const parsed = addProjectMemberSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Please provide a valid email address",
      details: parsed.error.flatten().fieldErrors,
    });
  }

    // Check whether the requester owns the project or is an Admin.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const requesterMembership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: ownerId,
        },
      },
      select: { role: true },
    });

    const requesterRole =
      project.ownerId === ownerId
        ? "OWNER"
        : requesterMembership?.role;

    if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
      return res.status(403).json({
        error: "Only the project owner or an Admin can add members",
      });
    }

    const requestedRole = parsed.data.role;

    // Admins cannot grant Admin or Owner privileges.
    if (requesterRole === "ADMIN" && requestedRole === "ADMIN") {
      return res.status(403).json({
        error: "Only the project owner can grant Admin access",
      });
    }

  // Find an existing TrackFlow account by email.
  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: parsed.data.email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (!user) {
    return res.status(404).json({
      error: "No TrackFlow account exists with that email address",
    });
  }

  // Prevent adding the same person twice.
  const existingMember = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: user.id,
      },
    },
  });

  if (existingMember) {
    return res.status(409).json({
      error: "This user is already a member of the project",
    });
  }

  const member = await prisma.projectMember.create({
    data: {
      projectId,
      userId: user.id,
      role: requestedRole,
    },
    select: {
      role: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return res.status(201).json({
    message: "Project member added successfully",
    member,
  });
});

// Remove a member from a project
router.delete("/:projectId/members/:userId", requireAuth, async (req, res) => {
  const ownerId = req.userId;
  const projectId = String(req.params.projectId ?? "");
  const userId = String(req.params.userId ?? "");

  if (!ownerId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  if (!projectId || !userId) {
    return res.status(400).json({ error: "Project ID and user ID are required." });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    if (project.ownerId !== ownerId) {
      return res.status(403).json({
        error: "Only the project owner can remove members.",
      });
    }

    if (userId === project.ownerId) {
      return res.status(400).json({
        error: "The project owner cannot be removed.",
      });
    }

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!membership) {
      return res.status(404).json({
        error: "This user is not a member of the project.",
      });
    }

    await prisma.projectMember.delete({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    return res.json({
      message: "Project member removed successfully.",
    });
  } catch (error) {
    console.error("Remove project member error:", error);

    return res.status(500).json({
      error: "Could not remove this member.",
    });
  }
});


const updateMemberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

// Change an existing project member's role (owner only)
router.patch(
  "/:projectId/members/:userId/role",
  requireAuth,
  async (req, res) => {
    const ownerId = req.userId;
    const projectId = String(req.params.projectId ?? "");
    const userId = String(req.params.userId ?? "");

    if (!ownerId) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const parsed = updateMemberRoleSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Choose a valid role: ADMIN, MEMBER, or VIEWER.",
      });
    }

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, ownerId: true },
      });

      if (!project) {
        return res.status(404).json({
          error: "Project not found.",
        });
      }

      if (project.ownerId !== ownerId) {
        return res.status(403).json({
          error: "Only the project owner can change member roles.",
        });
      }

      if (userId === project.ownerId) {
        return res.status(400).json({
          error: "The project owner's role cannot be changed.",
        });
      }

      const membership = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      if (!membership) {
        return res.status(404).json({
          error: "This user is not a member of the project.",
        });
      }

      const updatedMember = await prisma.projectMember.update({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
        data: {
          role: parsed.data.role,
        },
        select: {
          role: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return res.json({
        message: "Member role updated successfully.",
        member: updatedMember,
      });
    } catch (error) {
      console.error("Update member role error:", error);

      return res.status(500).json({
        error: "Could not update this member's role.",
      });
    }
  },
);

  const updateProjectSchema = z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).nullable().optional(),
  });

  // Update project name and description (owner only)
  router.patch(
    "/:projectId",
    requireAuth,
    async (req, res) => {
      const userId = req.userId;
      const projectId = String(req.params.projectId ?? "");

      if (!userId) {
        return res.status(401).json({
          error: "Authentication required.",
        });
      }

      const parsed = updateProjectSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Enter a project name between 2 and 100 characters and a description up to 500 characters.",
        });
      }

      try {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { id: true, ownerId: true },
        });

        if (!project) {
          return res.status(404).json({
            error: "Project not found.",
          });
        }

        if (project.ownerId !== userId) {
          return res.status(403).json({
            error: "Only the project owner can edit project details.",
          });
        }

        const updatedProject = await prisma.project.update({
          where: { id: projectId },
          data: {
            name: parsed.data.name,
            description: parsed.data.description ?? null,
          },
        });

        return res.json({
          message: "Project updated successfully.",
          project: updatedProject,
        });
      } catch (error) {
        console.error("Update project error:", error);

        return res.status(500).json({
          error: "Could not update project details.",
        });
      }
    },
  );

export default router;
