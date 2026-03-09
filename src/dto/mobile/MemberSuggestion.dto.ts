import { IsString, IsNotEmpty } from "class-validator";

export class CreateSuggestionDto {

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
