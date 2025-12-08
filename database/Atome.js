import { EntitySchema } from "typeorm";

/**
 * Atome - ADOLE compliant document entity
 * 
 * Supports both legacy fields (user_id, project_id) and
 * new ADOLE fields (kind, type, data, meta, logicalClock, etc.)
 */
export class Atome {
  constructor(id, kind, type, data, meta) {
    this.id = id;
    this.kind = kind || 'generic';
    this.type = type || 'generic';
    this.data = data || {};
    this.meta = meta || {};
  }
}

export const AtomeEntity = new EntitySchema({
  name: "Atome",
  target: Atome,
  tableName: "atome",
  columns: {
    id: {
      primary: true,
      type: "varchar",
      length: 255,
    },
    // ADOLE fields
    kind: {
      type: "varchar",
      length: 100,
      nullable: true,
      default: "generic"
    },
    type: {
      type: "varchar",
      length: 100,
      nullable: true,
      default: "generic"
    },
    data: {
      type: "jsonb",
      nullable: true
    },
    meta: {
      type: "jsonb",
      nullable: true
    },
    parentId: {
      type: "varchar",
      length: 255,
      nullable: true
    },
    logicalClock: {
      type: "int",
      nullable: true,
      default: 1
    },
    deviceId: {
      type: "varchar",
      length: 255,
      nullable: true
    },
    // Legacy fields (for backward compatibility)
    user_id: {
      type: "int",
      nullable: true
    },
    project_id: {
      type: "int",
      nullable: true
    },
    name_project: {
      type: "varchar",
      length: 255,
      nullable: true
    },
    // Timestamps
    createdAt: {
      type: "timestamp",
      createDate: true,
      nullable: true
    },
    updatedAt: {
      type: "timestamp",
      updateDate: true,
      nullable: true
    },
    deletedAt: {
      type: "timestamp",
      nullable: true
    }
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "user_id" },
      inverseSide: "atomes",
      nullable: true
    },
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      inverseSide: "atomes",
      nullable: true
    },
  },
});

export default Atome;
