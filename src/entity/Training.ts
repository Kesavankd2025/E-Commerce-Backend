import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity()
export class Training {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  trainingId: string;

  @Column()
  chapterIds: ObjectId[];

  @Column()
  zoneIds: ObjectId[];

  @Column()
  regionIds: ObjectId[];

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  trainerIds: ObjectId[];

  @Column()
  trainingDateTime: Date;

  @Column()
  lastDateForApply: Date;

  @Column()
  duration: number;

  @Column("double")
  trainingFee: number;

  @Column()
  mode: "online" | "in-person";

  @Column()
  locationOrLink: string;

  @Column({ nullable: true })
  location?: {
    name?: string;
    latitude?: number;
    longitude?: number;
  } = {
      name: "",
      latitude: 0,
      longitude: 0
    };

  @Column()
  maxAllowed: number;

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

  @Column("simple-json", { nullable: true })
  qrImage?: {
    fileName?: string;
    Path?: string;
    originalName?: string;
  };

  @Column("simple-json", { nullable: true })
  trainingImage?: {
    fileName?: string;
    Path?: string;
    originalName?: string;
  };

  @Column("simple-json", { nullable: true })
  paymentDetail?: {
    accountNumber?: string;
    accountName?: string;
    branch?: string;
    ifsc?: string;
  };

  @Column("simple-json", { nullable: true })
  paymentQrImage?: {
    fileName?: string;
    Path?: string;
    originalName?: string;
  };
}
