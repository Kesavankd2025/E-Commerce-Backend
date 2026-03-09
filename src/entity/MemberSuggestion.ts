import {
  Entity,
  Column,
  ObjectIdColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from "typeorm";
import { ObjectId } from "mongodb";

export type SuggestionStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "RESOLVED"
  | "REJECTED";

@Entity("member_suggestions")
@Index(["createdBy"])
@Index(["status"])
export class MemberSuggestion {

  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  subject: string;

  @Column()
  message: string;

  @Column({ default: "PENDING" })
  status: SuggestionStatus;

  @Column({ default: 1 })
  isActive: number;

  @Column({ default: 0 })
  isDelete: number;

  @Column()
  createdBy: ObjectId;

  @Column({ nullable: true })
  updatedBy?: ObjectId;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
