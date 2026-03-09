import { ObjectId } from "mongodb";
import { Column, CreateDateColumn, Entity, Index, ObjectIdColumn } from "typeorm";
@Index(
  ["userId", "pointKey", "source", "sourceId"],
  { unique: true }
)
@Entity("userpointhistories")
export class UserPointHistory {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  userId: ObjectId;

  @Column()
  pointKey: string;

  @Column()
  change: number;

  @Column()
  source: string;

  @Column({ nullable: true })
  sourceId?: ObjectId;

  @Column({ nullable: true })
  remarks?: string;

  @CreateDateColumn()
  createdAt: Date;
}
