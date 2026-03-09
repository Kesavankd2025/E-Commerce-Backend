import { ObjectId } from "mongodb";
import {
  Entity,
  Column,
  ObjectIdColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from "typeorm";

export type AttendanceStatus =
  | "present"
  | "late"
  | "absent"
  | "medical"
  | "proxy";

export type SourceType =
  | "MEETING"
  | "TRAINING";

export interface ILocation {
  name?: string;
  latitude?: number;
  longitude?: number;
}

@Entity("attendance")
@Index(["memberId", "sourceId", "sourceType"], { unique: true })
@Index(["sourceId"])
@Index(["memberId"])
@Index(["sourceType"])
export class Attendance {

  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  memberId: ObjectId;

  @Column()
  sourceId: ObjectId;

  @Column()
  sourceType: SourceType;

  @Column()
  userLocation?: ILocation;

  @Column()
  createdBy: ObjectId;

  @Column({ nullable: true })
  updatedBy?: ObjectId;

  @Column()
  status: AttendanceStatus;

  @Column({ default: 1 })
  isActive: number;

  @Column({ default: 0 })
  isDelete: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt?: Date;
}
