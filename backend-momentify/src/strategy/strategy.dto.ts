import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, Max, Min } from 'class-validator';

export class StrategyConfigDto {
  @ApiProperty({ example: 9, minimum: 2, maximum: 99 })
  @IsInt()
  @Min(2)
  @Max(99)
  fastPeriod!: number;

  @ApiProperty({ example: 21, minimum: 3, maximum: 100 })
  @IsInt()
  @Min(3)
  @Max(100)
  slowPeriod!: number;

  @ApiProperty({ example: 10, minimum: 1, maximum: 100 })
  @IsNumber()
  @Min(1)
  @Max(100)
  positionSizePercent!: number;

  @ApiProperty({ example: 5, minimum: 0.1, maximum: 50 })
  @IsNumber()
  @Min(0.1)
  @Max(50)
  maxDailyLossPercent!: number;

  @ApiProperty({ example: 3, minimum: 0.1, maximum: 50 })
  @IsNumber()
  @Min(0.1)
  @Max(50)
  stopLossPercent!: number;

  @ApiProperty({ example: 6, minimum: 0.1, maximum: 100 })
  @IsNumber()
  @Min(0.1)
  @Max(100)
  takeProfitPercent!: number;
}

export class StrategyStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  running!: boolean;
}
