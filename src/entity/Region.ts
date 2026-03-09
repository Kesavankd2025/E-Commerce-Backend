import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity('regions')
export class Region {
  @ObjectIdColumn()
  id: ObjectId;

  @Column({ default: 1 })
  isActive: number;

  @Column({ default: 0 })
  isDelete: number;

  @Column()
  zoneId: ObjectId;

  @Column()
  region: string;

  @Column()
  edId: ObjectId; //admin entity

  @Column()
  rdIds: ObjectId[]; // admin entity

  @Column()
  createdBy: ObjectId;

  @Column()
  updatedBy: ObjectId;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
