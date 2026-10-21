// @ts-check

import i18next from "i18next";
import { ValidationError } from "objection";

export default (app) => {
  app
    .get("/tasks", { name: "tasks" }, async (req, reply) => {
      const status = req.query.status || "";
      const executor = req.query.executor || "";
      const label = req.query.label || "";
      const isCreatorUser = req.isAuthenticated() && req.query.isCreatorUser === "1";

      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const tasksQuery = app.objection.models.task
        .query()
        .withGraphJoined("[status, creator, executor, labels]");

      if (status !== "") {
        tasksQuery.where("tasks.statusId", Number(status));
      }

      if (executor !== "") {
        tasksQuery.where("tasks.executorId", Number(executor));
      }

      if (isCreatorUser) {
        tasksQuery.where("tasks.creatorId", req.user.id);
      }

      if (label !== "") {
        tasksQuery.where("labels.id", Number(label));
      }

      const tasks = await tasksQuery;
      const statuses = await app.objection.models.taskStatus.query();
      const users = await app.objection.models.user.query();
      const labels = await app.objection.models.label.query();

      reply.render("tasks/index", {
        tasks,
        statuses,
        users,
        labels,
        filters: { status, executor, isCreatorUser, label },
      });

      return reply;
    })

    .get("/tasks/new", { name: "newTask" }, async (req, reply) => {
      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const task = new app.objection.models.task();

      const statuses = await app.objection.models.taskStatus.query();
      const users = await app.objection.models.user.query();
      const labels = await app.objection.models.label.query();

      const header = i18next.t("views.tasks.new.header");

      reply.render("tasks/new", {
        task,
        statuses,
        users,
        labels,
        header,
      });

      return reply;
    })

    .get("/tasks/:id", { name: "task" }, async (req, reply) => {
      const task = await app.objection.models.task
        .query()
        .findById(req.params.id)
        .withGraphFetched("[status, creator, executor, labels]");

      reply.render("tasks/show", { task });

      return reply;
    })

    .get("/tasks/:id/edit", { name: "editTask" }, async (req, reply) => {
      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const task = await app.objection.models.task
        .query()
        .findById(req.params.id)
        .withGraphFetched("labels");

      const statuses = await app.objection.models.taskStatus.query();
      const users = await app.objection.models.user.query();
      const labels = await app.objection.models.label.query();

      const header = i18next.t("views.tasks.edit.header");

      reply.render("tasks/edit", {
        task,
        statuses,
        users,
        labels,
        header,
      });

      return reply;
    })
    .patch("/tasks/:id", async (req, reply) => {
      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const task = await app.objection.models.task.query().findById(req.params.id);

      const labelIds = req.body.data.labelIds || [];

      const taskData = {
        name: req.body.data.name,
        description: req.body.data.description,
        statusId: Number(req.body.data.statusId),
        executorId: req.body.data.executorId ? Number(req.body.data.executorId) : null,
      };

      task.$set(taskData);

      try {
        await task.$query().patch(taskData);

        await task.$relatedQuery("labels").unrelate();

        for (const labelId of labelIds) {
          await task.$relatedQuery("labels").relate(Number(labelId));
        }

        req.flash("info", i18next.t("flash.tasks.update.success"));
        reply.redirect(app.reverse("tasks"));
      } catch (error) {
        if (!(error instanceof ValidationError)) {
          throw error;
        }

        const { data } = error;
        req.flash("error", i18next.t("flash.tasks.update.error"));

        const statuses = await app.objection.models.taskStatus.query();
        const users = await app.objection.models.user.query();
        const labels = await app.objection.models.label.query();
        const header = i18next.t("views.tasks.edit.header");

        reply.render("tasks/edit", {
          task,
          statuses,
          users,
          labels,
          errors: data,
          header,
        });
      }

      return reply;
    })

    .delete("/tasks/:id", async (req, reply) => {
      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const task = await app.objection.models.task.query().findById(req.params.id);

      if (task.creatorId !== req.user.id) {
        req.flash("error", i18next.t("flash.tasks.delete.error"));
        reply.redirect(app.reverse("tasks"));
        return reply;
      }

      await app.objection.models.task.transaction(async (trx) => {
        await task.$relatedQuery("labels", trx).unrelate();
        await task.$query(trx).delete();
      });

      req.flash("info", i18next.t("flash.tasks.delete.success"));
      reply.redirect(app.reverse("tasks"));

      return reply;
    })

    .post("/tasks", async (req, reply) => {
      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const labelIds = req.body.data.labelIds || [];

      const taskData = {
        name: req.body.data.name,
        description: req.body.data.description,
        statusId: Number(req.body.data.statusId),
        executorId: req.body.data.executorId ? Number(req.body.data.executorId) : null,
        creatorId: req.user.id,
      };

      const task = new app.objection.models.task();
      task.$set(taskData);

      try {
        const validTask = app.objection.models.task.fromJson(taskData);

        const createdTask = await app.objection.models.task.query().insert(validTask);

        for (const labelId of labelIds) {
          await createdTask.$relatedQuery("labels").relate(Number(labelId));
        }

        req.flash("info", i18next.t("flash.tasks.create.success"));
        reply.redirect(app.reverse("tasks"));
      } catch (error) {
        if (!(error instanceof ValidationError)) {
          throw error;
        }

        const errors = error.data;

        req.flash("error", i18next.t("flash.tasks.create.error"));

        const statuses = await app.objection.models.taskStatus.query();
        const users = await app.objection.models.user.query();
        const labels = await app.objection.models.label.query();
        const header = i18next.t("views.tasks.new.header");

        reply.render("tasks/new", {
          task,
          statuses,
          users,
          labels,
          errors,
          header,
        });
      }

      return reply;
    });
};
