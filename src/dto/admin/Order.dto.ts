import {
  IsMongoId,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsOptional,
  IsEnum
} from "class-validator";
import { Type } from "class-transformer";
import { OrderStatus, PaymentStatus } from "../../entity/Order";
import { ObjectId } from "mongodb";

// ------------------------------
// PRODUCT ITEM DTO
// ------------------------------
export class OrderProductDto {

  @IsMongoId()
  productId: ObjectId;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsNumber()
  @Min(1)
  qty: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @Min(0)
  total: number;
}

// ------------------------------
// CREATE ORDER DTO
// ------------------------------
export class CreateOrderDto {

  // LOCATION
  @IsMongoId()
  zoneId: string;

  @IsMongoId()
  regionId: string;

  @IsMongoId()
  chapterId: string;

  // MEMBER
  @IsMongoId()
  memberId: string;

  // PRODUCTS (MULTIPLE)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderProductDto)
  products: OrderProductDto[];

  // GRAND TOTAL
  @IsNumber()
  @Min(0)
  grantTotal: number;

  // OPTIONAL SYSTEM FIELDS
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;
}
