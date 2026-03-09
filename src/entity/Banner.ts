import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("Banner")
export class Gallery {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column("simple-json", { nullable: true })
  bannerImage?: {
    fileName?: string;
    path?: string;
    originalName?: string;
  };

  @Column({ default: 1 })
  isActive: number;

  @Column({ default: 0 })
  isDelete: number;

  @Column()
  createdBy: ObjectId;

  @Column()
  updatedBy: ObjectId;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
