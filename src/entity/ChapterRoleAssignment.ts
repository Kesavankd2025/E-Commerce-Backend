import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("chapter_role_assignments")
@Index(["chapterId", "roleId"], { unique: true })
export class ChapterRoleAssignment {

  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  chapterId: ObjectId;

  @Column()
  roleId: ObjectId;

  @Column()
  memberId: ObjectId;

  @Column({ default: 1 })
  isActive: number;

  @Column({ default: 0 })
  isDelete: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  createdBy: ObjectId;

  @Column()
  updatedBy: ObjectId;
}
