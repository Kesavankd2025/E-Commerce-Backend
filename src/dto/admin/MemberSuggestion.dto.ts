import { IsIn } from "class-validator";

export class UpdateSuggestionStatusDto {
  @IsIn(["PENDING", "IN_REVIEW", "RESOLVED", "REJECTED"])
  status: string;
}
