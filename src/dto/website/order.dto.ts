import { IsNotEmpty, IsString, IsArray, IsNumber, IsOptional, IsMongoId, ValidateNested, IsEnum, IsObject } from "class-validator";
import { Type } from "class-transformer";

class ProductCombinationDto {
    @IsMongoId()
    @IsNotEmpty()
    attributeId: string;

    @IsString()
    @IsNotEmpty()
    value: string;
}

class ProductImageDto {
    @IsString()
    @IsOptional()
    originalName?: string;

    @IsString()
    @IsOptional()
    fileName?: string;

    @IsString()
    @IsOptional()
    path?: string;
}

class OrderProductDto {
    @IsMongoId()
    @IsNotEmpty()
    productId: string;

    @IsString()
    @IsNotEmpty()
    productName: string;

    @IsNotEmpty()
    sku: string | number;

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => ProductCombinationDto)
    combination?: ProductCombinationDto[];

    @IsNumber()
    @IsNotEmpty()
    price: number;

    @IsNumber()
    @IsNotEmpty()
    mrp: number;

    @IsNumber()
    @IsNotEmpty()
    qty: number;

    @IsNumber()
    @IsNotEmpty()
    total: number;

    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => ProductImageDto)
    image?: ProductImageDto;
}

class OrderAddressDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsString()
    @IsNotEmpty()
    doorNo: string;

    @IsString()
    @IsNotEmpty()
    street: string;

    @IsString()
    @IsNotEmpty()
    city: string;

    @IsString()
    @IsNotEmpty()
    state: string;

    @IsString()
    @IsNotEmpty()
    pincode: string;
}

export class CreateOrderDto {
    @IsMongoId()
    @IsNotEmpty()
    userId: string;

    @IsArray()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => OrderProductDto)
    products: OrderProductDto[];

    @IsNumber()
    @IsNotEmpty()
    totalAmount: number;

    @IsNumber()
    @IsNotEmpty()
    taxAmount: number;

    @IsNumber()
    @IsNotEmpty()
    shippingCharge: number;

    @IsNumber()
    @IsNotEmpty()
    grandTotal: number;

    @IsString()
    @IsNotEmpty()
    paymentMethod: string;

    @IsString()
    @IsNotEmpty()
    paymentStatus: string;

    @IsString()
    @IsOptional()
    @IsEnum(["Pending", "Packed", "Shipped", "Delivered", "Return"])
    orderStatus?: string;

    @IsMongoId()
    @IsOptional()
    shippingMethodId?: string;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => OrderAddressDto)
    address: OrderAddressDto;
}
