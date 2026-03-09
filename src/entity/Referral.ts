import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from "typeorm";
import { ReferralFor, ReferralStatus, ReferralType } from "../enum/referrals";
import { ObjectId } from "mongodb";
import { IsEnum } from "class-validator";

@Entity("referrals")
export class Referral {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  referralFor: ReferralFor;

  @Column({ nullable: true })
  chapterId?: ObjectId; // used when OTHER_CHAPTER

  @Column()
  toMemberId: ObjectId; // selected person

  // ===== STEP 2 =====
  @Column()
  referralType: ReferralType;

  @Column({ default: false })
  toldWouldCall: boolean;

  @Column({ default: false })
  givenCard: boolean;

  @Column()
  referralName: string;

  @Column()
  telephone: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  address?: string;

  @Column()
  rating: number;

  @Column({ nullable: true })
  comments?: string;

  @Column({ nullable: true })
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;

  @Column()
  fromMemberId: ObjectId;

  @Column({ default: 1 })
  isActive: number;

  @Column({ default: 0 })
  isDelete: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
