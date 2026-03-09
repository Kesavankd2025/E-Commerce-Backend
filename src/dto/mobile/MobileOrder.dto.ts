import {
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsMongoId,
  IsEnum,
  IsOptional,
} from "class-validator";
import { Type, Transform } from "class-transformer";

export class MobileOrderProductDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(1)
  qty: number;
}

export class CreateMobileOrderDto {
  @Transform(({ value }) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (error) {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MobileOrderProductDto)
  products: MobileOrderProductDto[];

  @IsEnum(["Offline", "Online"])
  @IsOptional()
  paymentMode: "Offline" | "Online";
}
