import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("mobile_chief_guest")
export class MobileChiefGuest {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column("simple-json", { nullable: true })
  profileImage?: {
    fileName?: string;
    path?: string;
    originalName?: string;
  };

  @Column()
  chiefGuestName: string;

  @Column()
  about: string;

  @Column()
  contactNumber: string;

  @Column()
  businessCategory: string;

  @Column()
  businessName: string;

  @Column()
  email: string;

  @Column({ default: "Pending" })
  status: "Approved" | "Rejected" | "Pending" | "MAY_BE";

  @Column()
  createdBy: ObjectId;

  @Column()
  sourceType: string;

  @Column()
  updatedBy: ObjectId;

  @Column({ default: 1 })
  isActive: number;

  @Column({ default: 0 })
  isDelete: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
