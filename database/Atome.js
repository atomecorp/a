import { EntitySchema } from "typeorm";

export class Atome {
  constructor(id, user_id, project_id, name_project) {
    this.id = id;
    this.user_id = user_id;
    this.project_id = project_id;
    this.name_project = name_project;
  }

  canBeUsedBy(user) {
    return this.user_id === user.id || user.hasPermission('admin');
  }

  belongsToProject(projectId) {
    return this.project_id === projectId;
  }
}

export const AtomeEntity = new EntitySchema({
  name: "Atome",
  target: Atome,
  tableName: "atome",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    user_id: {
      type: "int",
    },
    project_id: {
      type: "int",
    },
    name_project: {
      type: "varchar",
      length: 255,
    },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "user_id" },
      inverseSide: "atomes",
    },
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      inverseSide: "atomes",
    },
  },
});

export default Atome;
