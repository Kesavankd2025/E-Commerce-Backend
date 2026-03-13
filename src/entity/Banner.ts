import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("banners")
export class Banner {
  @ObjectIdColumn()
  id: ObjectId;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  link: string;

  @Column("simple-json", { nullable: true })
  image?: {
    fileName?: string;
    path?: string;
    originalName?: string;
  };

  @Column({ default: true })
  status: boolean;

  @Column({ default: 0 })
  isDelete: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: ObjectId;

  @Column({ nullable: true })
  updatedBy: ObjectId;
}
