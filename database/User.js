import { EntitySchema } from "typeorm";

export class User {
  constructor(id, name, password, autorisation, project_id) {
    this.id = id;
    this.name = name;
    this.password = password;
    this.autorisation = autorisation;
    this.project_id = project_id;
  }

  hasPermission(requiredLevel) {
    const levels = { read: 1, edit: 2, admin: 3 };
    return levels[this.autorisation] >= levels[requiredLevel];
  }

  canAccessProject(project) {
    return this.project_id === project.id;
  }
}

export const UserEntity = new EntitySchema({
  name: "User",
  target: User,
  tableName: "user",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    name: {
      type: "varchar",
      length: 255,
    },
    password: {
      type: "varchar",
      length: 255,
    },
    autorisation: {
      type: "varchar",
      default: "read",
    },
    project_id: {
      type: "int",
      nullable: true,
    },
  },
  relations: {
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      inverseSide: "users",
    },
    atomes: {
      type: "one-to-many",
      target: "Atome",
      inverseSide: "user",
    },
  },
});

export default User;
