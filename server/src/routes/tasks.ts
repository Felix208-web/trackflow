
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

async function canManageProjectTasks(
  projectId: string,
  userId: string
): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { ownerId: userId },
        {
          members: {
            some: {
              userId,
              role: {
                in: ["OWNER", "ADMIN", "MEMBER"],
              },
            },
          },
        },
      ],
    },
    select: { id: true },
  });

  return project !== null;
}

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  listId: z.string().min(1),
  dueDate: z.coerce.date().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid task details",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const userId = req.userId!;
  const { title, description, listId, assigneeId, dueDate } = parsed.data;

  // Confirm the list belongs to a project this user can access.
  const list = await prisma.taskList.findFirst({
    where: {
      id: listId,
      board: {
        project: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } },
          ],
        },
      },
    },
    select: {
      id: true,
      board: {
        select: {
          projectId: true,
        },
      },
      tasks: {
        orderBy: { position: "desc" },
        take: 1,
        select: { position: true },
      },
    },
  });

    if (!list) {
      return res.status(404).json({
        error: "Task list not found",
      });
    }

    const canManage = await canManageProjectTasks(
      list.board.projectId,
      userId
    );

    if (!canManage) {
      return res.status(403).json({
        error: "You do not have permission to create tasks in this project",
      });
    }

  // If an assignee was provided, verify they belong to this project.
  if (assigneeId) {
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: list.board.projectId,
          userId: assigneeId,
        },
      },
      select: { userId: true },
    });

    if (!membership) {
      return res.status(400).json({
        error: "Assignee must be a member of this project",
      });
    }
  }

  const nextPosition =
    list.tasks.length > 0 ? list.tasks[0].position + 1 : 0;

  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      listId: list.id,
      position: nextPosition,
      dueDate: dueDate ?? null,
      assigneeId: assigneeId ?? null,
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      position: true,
      dueDate: true,
      listId: true,
      assigneeId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return res.status(201).json({ task });
});

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// Edit a task

router.patch("/:taskId", requireAuth, async (req, res) => {
  const taskId = req.params.taskId;

  if (typeof taskId !== "string") {
    return res.status(400).json({ error: "Invalid task ID" });
  }

  const parsed = updateTaskSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid task details",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const userId = req.userId!;

  // Find the task and the project it belongs to.
  const existingTask = await prisma.task.findFirst({
    where: {
      id: taskId,
      list: {
        board: {
          project: {
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      list: {
        select: {
          board: {
            select: {
              projectId: true,
            },
          },
        },
      },
    },
  });

    if (!existingTask) {
      return res.status(404).json({ error: "Task not found" });
    }

    const canManage = await canManageProjectTasks(
      existingTask.list.board.projectId,
      userId
    );

    if (!canManage) {
      return res.status(403).json({
        error: "You do not have permission to edit tasks in this project",
      });
    }

    const { assigneeId } = parsed.data;

  // An assignee must belong to the same project.
  if (assigneeId) {
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: existingTask.list.board.projectId,
          userId: assigneeId,
        },
      },
      select: { userId: true },
    });

    if (!membership) {
      return res.status(400).json({
        error: "Assignee must be a member of this project",
      });
    }
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: parsed.data,
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      position: true,
      dueDate: true,
      listId: true,
      assigneeId: true,
      updatedAt: true,
    },
  });

  return res.json({ task });
});

// Delete a task
router.delete("/:taskId", requireAuth, async (req, res) => {
  const taskId = req.params.taskId;

  if (typeof taskId !== "string") {
    return res.status(400).json({ error: "Invalid task ID" });
  }

  const userId = req.userId!;

  const existingTask = await prisma.task.findFirst({
    where: {
      id: taskId,
      list: {
        board: {
          project: {
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } },
            ],
          },
        },
      },
    },
        select: {
          id: true,
          list: {
            select: {
              board: {
                select: {
                  projectId: true,
                },
              },
            },
          },
        },
  });

    if (!existingTask) {
      return res.status(404).json({ error: "Task not found" });
    }

    const canManage = await canManageProjectTasks(
      existingTask.list.board.projectId,
      userId
    );

    if (!canManage) {
      return res.status(403).json({
        error: "You do not have permission to delete tasks in this project",
      });
    }

    await prisma.task.delete({
    where: { id: taskId },
  });

  return res.status(204).send();
});


const moveTaskSchema = z.object({
  listId: z.string().min(1),
});

router.patch("/:taskId/move", requireAuth, async (req, res) => {
  const taskId = req.params.taskId;

  if (typeof taskId !== "string") {
    return res.status(400).json({ error: "Invalid task ID" });
  }

  const parsed = moveTaskSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid destination list",
    });
  }

  const userId = req.userId!;
  const { listId } = parsed.data;

  // Find the task and verify project access.
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      list: {
        board: {
          project: {
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      listId: true,
      list: {
        select: {
          board: {
            select: { projectId: true },
          },
        },
      },
    },
  });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const canManage = await canManageProjectTasks(
      task.list.board.projectId,
      userId
    );

    if (!canManage) {
      return res.status(403).json({
        error: "You do not have permission to move tasks in this project",
      });
    }

  // The destination must belong to the same project.
  const destination = await prisma.taskList.findFirst({
    where: {
      id: listId,
      board: {
        projectId: task.list.board.projectId,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!destination) {
    return res.status(400).json({
      error: "Destination list must belong to the same project",
    });
  }

  const statusByList: Record<string, "TODO" | "IN_PROGRESS" | "DONE"> = {
    "To do": "TODO",
    "In progress": "IN_PROGRESS",
    Done: "DONE",
  };

  const status = statusByList[destination.name];

  if (!status) {
    return res.status(400).json({
      error: "Unsupported destination list",
    });
  }

  const lastTask = await prisma.task.findFirst({
    where: { listId: destination.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const updatedTask = await prisma.task.update({
    where: { id: task.id },
    data: {
      listId: destination.id,
      status,
      position:
        task.listId === destination.id
          ? undefined
          : lastTask
            ? lastTask.position + 1
            : 0,
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      position: true,
      listId: true,
      dueDate: true,
      updatedAt: true,
    },
  });

  return res.json({ task: updatedTask });
});

export default router;
