import { IsNotEmpty, IsString, IsOptional, IsBoolean, IsNumber, IsArray, IsEnum, Min, Max, IsDateString } from "class-validator";

export class CreateCouponDto {
    @IsNotEmpty()
    @IsString()
    code: string;

    @IsNotEmpty()
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsBoolean()
    status?: boolean;

    @IsNotEmpty()
    @IsDateString()
    startDate: string;

    @IsNotEmpty()
    @IsDateString()
    endDate: string;

    @IsNotEmpty()
    @IsEnum(["percentage", "fixed"])
    discountType: "percentage" | "fixed";

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    discountValue: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    maxDiscountAmount?: number;

    @IsNotEmpty()
    @IsEnum(["all", "category", "product"])
    offerType: "all" | "category" | "product";

    @IsOptional()
    @IsArray()
    categoryIds?: string[];

    @IsOptional()
    @IsArray()
    productIds?: string[];

    @IsOptional()
    @IsNumber()
    @Min(0)
    minOrderAmount?: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    totalLimit: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    userLimit: number;

    @IsNotEmpty()
    @IsEnum(["all", "new", "specific"])
    applicableUserType: "all" | "new" | "specific";

    @IsOptional()
    @IsArray()
    specificUserIds?: string[];

    @IsOptional()
    @IsArray()
    excludedProductIds?: string[];

    @IsOptional()
    @IsArray()
    excludedCategoryIds?: string[];

    @IsOptional()
    @IsBoolean()
    allowCombining?: boolean;

    @IsOptional()
    @IsBoolean()
    isPublic?: boolean;

    @IsOptional()
    @IsBoolean()
    autoApply?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(0)
    priority?: number;
}

export class UpdateCouponDto extends CreateCouponDto {
    @IsOptional()
    @IsString()
    code: string;

    @IsOptional()
    @IsString()
    title: string;

    @IsOptional()
    @IsDateString()
    startDate: string;

    @IsOptional()
    @IsDateString()
    endDate: string;

    @IsOptional()
    @IsEnum(["percentage", "fixed"])
    discountType: "percentage" | "fixed";

    @IsOptional()
    @IsNumber()
    discountValue: number;

    @IsOptional()
    @IsEnum(["all", "category", "product"])
    offerType: "all" | "category" | "product";

    @IsOptional()
    @IsNumber()
    totalLimit: number;

    @IsOptional()
    @IsNumber()
    userLimit: number;

    @IsOptional()
    @IsEnum(["all", "new", "specific"])
    applicableUserType: "all" | "new" | "specific";
}
