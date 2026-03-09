import { ObjectId } from "mongodb";
import { Column, CreateDateColumn, Entity, ObjectIdColumn, UpdateDateColumn } from "typeorm";

@Entity("points")
export class Points {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column({ default: 0 })
  value: number;

  @Column()
  order: number;

  @Column({ default: 1 })
  isActive: number;

  @Column({ default: 0 })
  isDelete: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
