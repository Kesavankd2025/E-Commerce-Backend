import { IsOptional, IsNotEmpty, IsString, IsBoolean, IsArray, IsIn } from "class-validator";

export class CreateShippingMethodDto {
    @IsNotEmpty()
    @IsString()
    @IsIn(['weight', 'pincode', 'amount'])
    type: 'weight' | 'pincode' | 'amount';

    @IsArray()
    @IsOptional()
    rules?: any[];

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

export class UpdateShippingMethodDto {
    @IsOptional()
    @IsString()
    @IsIn(['weight', 'pincode', 'amount'])
    type?: 'weight' | 'pincode' | 'amount';

    @IsArray()
    @IsOptional()
    rules?: any[];

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}
