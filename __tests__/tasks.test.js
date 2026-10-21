// @ts-check

import { faker } from "@faker-js/faker";
import fastify from "fastify";
import init from "../server/plugin.js";
import { getTestData, prepareData } from "./helpers/index.js";

describe("test tasks CRUD", () => {
  let app;
  let knex;
  let models;

  const testData = getTestData();

  const signIn = async () => {
    const response = await app.inject({
      method: "POST",
      url: app.reverse("session"),
      payload: {
        data: testData.users.existing,
      },
    });

    const [sessionCookie] = response.cookies;

    return {
      [sessionCookie.name]: sessionCookie.value,
    };
  };

  beforeAll(async () => {
    app = fastify({
      exposeHeadRoutes: false,
      logger: { target: "pino-pretty" },
    });

    await init(app);

    knex = app.objection.knex;
    models = app.objection.models;

    await knex.migrate.latest();
  });

  beforeEach(async () => {
    await knex("tasks_labels").del();
    await knex("tasks").del();
    await knex("labels").del();
    await knex("task_statuses").del();
    await knex("users").del();

    await prepareData(app);

    const users = await models.user.query();
    const statuses = await models.taskStatus.query();

    await models.task.query().insert({
      name: "Implement authentication",
      description: "Add authentication to the application",
      statusId: statuses[0].id,
      creatorId: users[0].id,
      executorId: users[1].id,
    });
  });

  it("task has many labels", async () => {
    const task = await models.task.query().first();
    const labels = await models.label.query();

    await task.$relatedQuery("labels").relate(labels[0].id);
    await task.$relatedQuery("labels").relate(labels[1].id);

    const taskWithLabels = await models.task.query().findById(task.id).withGraphFetched("labels");

    expect(taskWithLabels.labels).toHaveLength(2);
    expect(taskWithLabels.labels[0].name).toBe("bug");
    expect(taskWithLabels.labels[1].name).toBe("feature");
  });

  it("index", async () => {
    const cookies = await signIn();
    const response = await app.inject({
      method: "GET",
      url: app.reverse("tasks"),
      cookies,
    });

    expect(response.statusCode).toBe(200);
  });

  it("filters tasks by status", async () => {
    const cookies = await signIn();
    const existingTask = await models.task.query().first();
    const statuses = await models.taskStatus.query();

    const otherStatus = statuses.find((status) => status.id !== existingTask.statusId);

    const otherTask = await models.task.query().insert({
      name: "Task belonging to another status",
      statusId: otherStatus.id,
      creatorId: existingTask.creatorId,
    });

    const response = await app.inject({
      method: "GET",
      url: `${app.reverse("tasks")}?status=${otherStatus.id}`,
      cookies,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(otherTask.name);
    expect(response.body).not.toContain(existingTask.name);
  });

  it("shows all tasks when the status filter is empty", async () => {
    const cookies = await signIn();
    const existingTask = await models.task.query().first();
    const statuses = await models.taskStatus.query();
    const otherStatus = statuses.find((status) => status.id !== existingTask.statusId);

    const otherTask = await models.task.query().insert({
      name: "Task with a different status",
      statusId: otherStatus.id,
      creatorId: existingTask.creatorId,
    });

    const response = await app.inject({
      method: "GET",
      url: `${app.reverse("tasks")}?status=`,
      cookies,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(existingTask.name);
    expect(response.body).toContain(otherTask.name);
  });

  it("shows no tasks when the selected status has no tasks", async () => {
    const cookies = await signIn();
    const existingTask = await models.task.query().first();
    const emptyStatus = await models.taskStatus.query().insert({
      name: "Status without tasks",
    });

    const response = await app.inject({
      method: "GET",
      url: `${app.reverse("tasks")}?status=${emptyStatus.id}`,
      cookies,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(existingTask.name);
    expect(response.body).not.toContain(`href="${app.reverse("task", { id: existingTask.id })}"`);
  });

  it("keeps the selected status in the filter form", async () => {
    const cookies = await signIn();
    const task = await models.task.query().first();
    const response = await app.inject({
      method: "GET",
      url: `${app.reverse("tasks")}?status=${task.statusId}`,
      cookies,
    });

    const statusSelect = response.body.match(
      /<select\b[^>]*\bid="status"[^>]*>([\s\S]*?)<\/select>/,
    );

    expect(response.statusCode).toBe(200);
    expect(statusSelect).not.toBeNull();

    const selectedOption = new RegExp(
      `<option\\b(?=[^>]*\\bvalue="${task.statusId}")(?=[^>]*\\sselected(?:\\s|=|>))[^>]*>`,
    );

    expect(statusSelect[1]).toMatch(selectedOption);
  });

  it("new", async () => {
    const cookies = await signIn();

    const response = await app.inject({
      method: "GET",
      url: app.reverse("newTask"),
      cookies,
    });

    expect(response.statusCode).toBe(200);
  });

  it("redirects guests from the task list", async () => {
    const response = await app.inject({
      method: "GET",
      url: app.reverse("tasks"),
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(app.reverse("root"));
  });

  it("cannot open new task page when unauthenticated", async () => {
    const response = await app.inject({
      method: "GET",
      url: app.reverse("newTask"),
    });

    expect(response.statusCode).toBe(302);
  });

  it("create", async () => {
    const cookies = await signIn();

    const users = await models.user.query();
    const statuses = await models.taskStatus.query();
    const labels = await models.label.query();

    const params = {
      name: faker.lorem.words(3),
      description: faker.lorem.sentence(),
      statusId: statuses[0].id,
      executorId: users[1].id,
    };

    const response = await app.inject({
      method: "POST",
      url: app.reverse("tasks"),
      cookies,
      payload: {
        data: {
          ...params,
          labelIds: [labels[0].id, labels[1].id],
        },
      },
    });

    expect(response.statusCode).toBe(302);

    const task = await models.task.query().findOne({
      name: params.name,
    });

    expect(task).toMatchObject(params);
    expect(task.creatorId).toBeDefined();

    const taskWithLabels = await models.task.query().findById(task.id).withGraphFetched("labels");

    expect(taskWithLabels.labels).toHaveLength(2);
    expect(taskWithLabels.labels.map((label) => label.id)).toEqual([labels[0].id, labels[1].id]);
  });

  it("show", async () => {
    const task = await models.task.query().first();

    const response = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}`,
    });

    expect(response.statusCode).toBe(200);
  });

  it("edit", async () => {
    const cookies = await signIn();
    const task = await models.task.query().first();

    const response = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/edit`,
      cookies,
    });

    expect(response.statusCode).toBe(200);
  });

  it("cannot edit task when unauthenticated", async () => {
    const task = await models.task.query().first();

    const response = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/edit`,
    });

    expect(response.statusCode).toBe(302);
  });

  it("update", async () => {
    const cookies = await signIn();
    const task = await models.task.query().first();
    const statuses = await models.taskStatus.query();
    const users = await models.user.query();
    const labels = await models.label.query();

    await task.$relatedQuery("labels").relate(labels[0].id);
    await task.$relatedQuery("labels").relate(labels[1].id);

    const params = {
      name: faker.lorem.words(3),
      description: faker.lorem.sentence(),
      statusId: statuses[1].id,
      executorId: users[1].id,
    };

    const response = await app.inject({
      method: "PATCH",
      url: `/tasks/${task.id}`,
      cookies,
      payload: {
        data: {
          ...params,
          labelIds: [labels[2].id],
        },
      },
    });

    expect(response.statusCode).toBe(302);

    const updatedTask = await models.task.query().findById(task.id);

    expect(updatedTask).toMatchObject(params);
    expect(updatedTask.creatorId).toBe(task.creatorId);

    const taskWithLabels = await models.task.query().findById(task.id).withGraphFetched("labels");

    expect(taskWithLabels.labels).toHaveLength(1);
    expect(taskWithLabels.labels[0].id).toBe(labels[2].id);
  });

  it("cannot update task when unauthenticated", async () => {
    const task = await models.task.query().first();

    const response = await app.inject({
      method: "PATCH",
      url: `/tasks/${task.id}`,
      payload: {
        data: {
          name: "Unauthorized update",
        },
      },
    });

    expect(response.statusCode).toBe(302);

    const unchangedTask = await models.task.query().findById(task.id);

    expect(unchangedTask.name).toBe(task.name);
  });

  it("creator can delete task", async () => {
    const cookies = await signIn();

    const users = await models.user.query();
    const statuses = await models.taskStatus.query();

    const creator = users.find((user) => user.email === testData.users.existing.email);

    const task = await models.task.query().insert({
      name: "Task to delete",
      description: "Created by authenticated user",
      statusId: statuses[0].id,
      creatorId: creator.id,
      executorId: null,
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/tasks/${task.id}`,
      cookies,
    });

    expect(response.statusCode).toBe(302);

    const deletedTask = await models.task.query().findById(task.id);

    expect(deletedTask).toBeUndefined();
  });

  it("deletes a labeled task while preserving labels and other associations", async () => {
    const cookies = await signIn();
    const creator = await models.user.query().findOne({ email: testData.users.existing.email });
    const otherTask = await models.task.query().first();
    const labels = await models.label.query();
    const task = await models.task.query().insert({
      name: "Labeled task to delete",
      statusId: otherTask.statusId,
      creatorId: creator.id,
    });
    for (const label of labels) {
      await task.$relatedQuery("labels").relate(label.id);
    }
    await otherTask.$relatedQuery("labels").relate(labels[0].id);
    await knex.raw("PRAGMA foreign_keys = ON");
    try {
      const response = await app.inject({ method: "DELETE", url: `/tasks/${task.id}`, cookies });
      expect(response.statusCode).toBe(302);
      expect(await models.task.query().findById(task.id)).toBeUndefined();
      expect(await knex("tasks_labels").where({ taskId: task.id })).toHaveLength(0);
      expect(await models.label.query()).toHaveLength(labels.length);
      expect(await otherTask.$relatedQuery("labels")).toHaveLength(1);
    } finally {
      await knex.raw("PRAGMA foreign_keys = OFF");
    }
  });

  it("restores label associations if task deletion fails", async () => {
    const cookies = await signIn();
    const creator = await models.user.query().findOne({ email: testData.users.existing.email });
    const otherTask = await models.task.query().first();
    const label = await models.label.query().first();
    const task = await models.task.query().insert({
      name: "Task whose deletion fails",
      statusId: otherTask.statusId,
      creatorId: creator.id,
    });
    await task.$relatedQuery("labels").relate(label.id);
    await knex.raw(
      "CREATE TRIGGER reject_task_delete BEFORE DELETE ON tasks BEGIN SELECT RAISE(ABORT, 'Deletion failed'); END",
    );
    try {
      const response = await app.inject({ method: "DELETE", url: `/tasks/${task.id}`, cookies });
      expect(response.statusCode).toBe(500);
      expect(await models.task.query().findById(task.id)).toBeDefined();
      expect(await task.$relatedQuery("labels")).toHaveLength(1);
    } finally {
      await knex.raw("DROP TRIGGER reject_task_delete");
    }
  });

  it("non-creator cannot delete task", async () => {
    const cookies = await signIn();
    const task = await models.task.query().first();

    const response = await app.inject({
      method: "DELETE",
      url: `/tasks/${task.id}`,
      cookies,
    });

    expect(response.statusCode).toBe(302);

    const existingTask = await models.task.query().findById(task.id);

    expect(existingTask).toBeDefined();
  });

  describe("executor and creator filters", () => {
    let currentUser;
    let otherUser;
    let firstStatus;
    let secondStatus;

    const taskNames = {
      a: "Filter task A",
      b: "Filter task B",
      c: "Filter task C",
      d: "Filter task D",
    };

    beforeEach(async () => {
      await models.task.query().delete();

      const users = await models.user.query();
      const statuses = await models.taskStatus.query();

      currentUser = users.find((user) => user.email === testData.users.existing.email);
      otherUser = users.find((user) => user.id !== currentUser.id);
      [firstStatus, secondStatus] = statuses;

      const tasks = [
        {
          name: taskNames.a,
          creatorId: currentUser.id,
          executorId: otherUser.id,
          statusId: firstStatus.id,
        },
        {
          name: taskNames.b,
          creatorId: otherUser.id,
          executorId: currentUser.id,
          statusId: firstStatus.id,
        },
        {
          name: taskNames.c,
          creatorId: currentUser.id,
          executorId: currentUser.id,
          statusId: secondStatus.id,
        },
        {
          name: taskNames.d,
          creatorId: otherUser.id,
          executorId: otherUser.id,
          statusId: secondStatus.id,
        },
      ];

      for (const task of tasks) {
        await models.task.query().insert(task);
      }
    });

    it("filters tasks by executor", async () => {
      const cookies = await signIn();
      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?executor=${currentUser.id}`,
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(taskNames.b);
      expect(response.body).toContain(taskNames.c);
      expect(response.body).not.toContain(taskNames.a);
      expect(response.body).not.toContain(taskNames.d);
    });

    it("combines status and executor filters", async () => {
      const cookies = await signIn();
      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?status=${firstStatus.id}&executor=${currentUser.id}`,
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(taskNames.b);
      expect(response.body).not.toContain(taskNames.a);
      expect(response.body).not.toContain(taskNames.c);
      expect(response.body).not.toContain(taskNames.d);
    });

    it("filters by the current user as creator, not executor", async () => {
      const cookies = await signIn();

      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?isCreatorUser=1`,
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(taskNames.a);
      expect(response.body).toContain(taskNames.c);
      expect(response.body).not.toContain(taskNames.b);
      expect(response.body).not.toContain(taskNames.d);
    });

    it("combines status, executor and creator filters", async () => {
      const cookies = await signIn();
      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?status=${secondStatus.id}&executor=${currentUser.id}&isCreatorUser=1`,
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(taskNames.c);
      expect(response.body).not.toContain(taskNames.a);
      expect(response.body).not.toContain(taskNames.b);
      expect(response.body).not.toContain(taskNames.d);
    });

    it("combines status, executor, creator and label filters", async () => {
      const cookies = await signIn();
      const label = await models.label.query().first();
      const tasks = await models.task.query();

      for (const task of tasks) {
        await task.$relatedQuery("labels").relate(label.id);
      }

      const taskWithoutLabel = await models.task.query().insert({
        name: "Matching task without the selected label",
        statusId: secondStatus.id,
        executorId: currentUser.id,
        creatorId: currentUser.id,
      });

      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?status=${secondStatus.id}&executor=${currentUser.id}&isCreatorUser=1&label=${label.id}`,
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(taskNames.c);
      expect(response.body).not.toContain(taskNames.a);
      expect(response.body).not.toContain(taskNames.b);
      expect(response.body).not.toContain(taskNames.d);
      expect(response.body).not.toContain(taskWithoutLabel.name);
    });

    it("shows all tasks when executor is empty and creator filter is absent", async () => {
      const cookies = await signIn();

      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?executor=`,
        cookies,
      });

      expect(response.statusCode).toBe(200);

      for (const name of Object.values(taskNames)) {
        expect(response.body).toContain(name);
      }
    });
  });

  describe("label filter", () => {
    let taskA;
    let taskB;
    let taskC;
    let labelOne;
    let labelTwo;

    beforeEach(async () => {
      await knex("tasks_labels").del();
      await models.task.query().delete();

      const users = await models.user.query();
      const statuses = await models.taskStatus.query();
      const labels = await models.label.query();

      [labelOne, labelTwo] = labels;

      taskA = await models.task.query().insert({
        name: "Label filter task A",
        statusId: statuses[0].id,
        creatorId: users[0].id,
      });

      taskB = await models.task.query().insert({
        name: "Label filter task B",
        statusId: statuses[1].id,
        creatorId: users[0].id,
      });

      taskC = await models.task.query().insert({
        name: "Label filter task C",
        statusId: statuses[0].id,
        creatorId: users[0].id,
      });

      await taskA.$relatedQuery("labels").relate(labelOne.id);
      await taskA.$relatedQuery("labels").relate(labelTwo.id);
      await taskB.$relatedQuery("labels").relate(labelTwo.id);
    });

    it("filters tasks by label", async () => {
      const cookies = await signIn();
      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?label=${labelOne.id}`,
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(taskA.name);
      expect(response.body).not.toContain(taskB.name);
      expect(response.body).not.toContain(taskC.name);
    });

    it("shows matching tasks without duplicates", async () => {
      const cookies = await signIn();
      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?label=${labelTwo.id}`,
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.split(taskA.name)).toHaveLength(2);
      expect(response.body.split(taskB.name)).toHaveLength(2);
      expect(response.body).not.toContain(taskC.name);
    });

    it("includes unlabeled tasks without duplicating tasks when the filter is empty", async () => {
      const cookies = await signIn();
      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?label=`,
        cookies,
      });

      expect(response.statusCode).toBe(200);

      for (const task of [taskA, taskB, taskC]) {
        expect(response.body.split(task.name)).toHaveLength(2);
      }
    });

    it("combines label and status filters", async () => {
      const cookies = await signIn();
      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?label=${labelTwo.id}&status=${taskA.statusId}`,
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(taskA.name);
      expect(response.body).not.toContain(taskB.name);
      expect(response.body).not.toContain(taskC.name);
    });

    it("shows no tasks when the selected label has no tasks", async () => {
      const cookies = await signIn();
      const unusedLabel = await models.label.query().insert({
        name: "Unused filter label",
      });

      const response = await app.inject({
        method: "GET",
        url: `${app.reverse("tasks")}?label=${unusedLabel.id}`,
        cookies,
      });

      expect(response.statusCode).toBe(200);

      for (const task of [taskA, taskB, taskC]) {
        expect(response.body).not.toContain(task.name);
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
