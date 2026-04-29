import { IsOptional, IsBoolean, IsNumber, IsObject } from "class-validator";
import { Type } from "class-transformer";

export class CreateAdvertisementDto {
    @IsObject()
    @IsOptional()
    image?: any;

    @IsBoolean()
    @IsOptional()
    status?: boolean;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    displayOrder?: number;
}

export class UpdateAdvertisementDto {
    @IsObject()
    @IsOptional()
    image?: any;

    @IsBoolean()
    @IsOptional()
    status?: boolean;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    displayOrder?: number;
}
