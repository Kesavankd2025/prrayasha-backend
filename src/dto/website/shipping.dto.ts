import { IsNotEmpty, IsString, IsNumber } from "class-validator";

export class CalculateShippingDto {
    @IsNotEmpty()
    @IsString()
    state: string;

    @IsNotEmpty()
    @IsNumber()
    totalAmount: number;
}
