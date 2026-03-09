import { ObjectId } from "mongodb";
import { Column, CreateDateColumn, Entity, ObjectIdColumn } from "typeorm";

@Entity("badge_history")
export class BadgeHistory {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  assignTo: "CHAPTER" | "MEMBER";

  @Column()
  assignToId?: ObjectId;

  @Column()
  badgeId: ObjectId;

  @Column()
  action: "ASSIGNED" | "REMOVED";

  @Column()
  createdBy: ObjectId;

  @CreateDateColumn()
  createdAt: Date;
}
