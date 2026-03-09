import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { ObjectId } from "mongodb";

export enum CommunityType {
  ASK = "ask",
  GIVE = "give",
  REQUIREMENT = "requirement",
}

@Entity()
export class Community {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  title: string;

  @Column()
  details: string;

  @Column("simple-array", { nullable: true })
  category: ObjectId[];

  @Column({ nullable: true })
  location: string;

  @Column({ type: "json", nullable: true })
  photos?: {
    fileName?: string;
    path?: string;
    originalName?: string;
  };

  @Column({
    type: "enum",
    enum: CommunityType,
    default: CommunityType.REQUIREMENT,
  })
  type: CommunityType;

  @Column()
  createdBy: ObjectId;

  @Column({ default: 0 })
  isDelete: number;

  @Column({ default: 1 })
  isActive: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: "json", nullable: true })
  responses: {
    userId: ObjectId;
    type: string;
    respondedAt: Date;
  }[];
}
