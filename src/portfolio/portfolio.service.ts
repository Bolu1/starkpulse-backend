/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  calculateROI,
  calculateVolatility,
  calculateTimeWeightedReturn,
} from './utils/performance-metrics';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioSnapshot } from './entities/portfolio.entity';
import { User } from 'src/auth/entities/user.entity';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(PortfolioSnapshot)
    private snapshotRepo: Repository<PortfolioSnapshot>,

    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  // Example calculation, you'll likely fetch from holdings/assets table
  private async calculateUserPortfolioValue(
    user: User,
  ): Promise<{ total: number; breakdown: Record<string, number> }> {
    // Placeholder logic — replace with real asset values
    const assets = {
      BTC: 0.5,
      ETH: 2.0,
    };

    const prices = {
      BTC: 50000,
      ETH: 2000,
    };

    let total = 0;
    for (const [symbol, quantity] of Object.entries(assets)) {
      total += quantity * prices[symbol];
    }

    return { total, breakdown: assets };
  }

  @Cron('0 * * * *') // Every hour
  async recordSnapshots() {
    const users = await this.userRepo.find();

    for (const user of users) {
      const { total, breakdown } = await this.calculateUserPortfolioValue(user);

      const snapshot = this.snapshotRepo.create({
        user,
        totalValue: total,
        assetBreakdown: breakdown,
      });

      await this.snapshotRepo.save(snapshot);
    }
  }
  async create(createDto: CreatePortfolioDto) {
    const user = await this.userRepo.findOneBy({
      id: String(createDto.userId),
    });

    if (!user) throw new NotFoundException('User not found');

    const snapshot = this.snapshotRepo.create({
      user,
      totalValue: createDto.totalValue,
      assetBreakdown: createDto.assetBreakdown,
    });

    return this.snapshotRepo.save(snapshot);
  }

  async findAll() {
    return this.snapshotRepo.find({ relations: ['user'] });
  }

  async findOne(id: number) {
    const snapshot = await this.snapshotRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!snapshot) throw new NotFoundException('Snapshot not found');
    return snapshot;
  }

  async update(id: number, updateDto: UpdatePortfolioDto) {
    const snapshot = await this.snapshotRepo.findOneBy({ id });
    if (!snapshot) throw new NotFoundException('Snapshot not found');

    Object.assign(snapshot, updateDto);
    return this.snapshotRepo.save(snapshot);
  }

  async remove(id: number) {
    const result = await this.snapshotRepo.delete(id);
    if (result.affected === 0)
      throw new NotFoundException('Snapshot not found');
    return { message: 'Deleted successfully' };
  }

  async getUserAnalytics(userId: string) {
    const snapshots = await this.snapshotRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'ASC' },
    });
  
    if (!snapshots.length) throw new NotFoundException('No snapshots found');
  
    const values = snapshots.map((s) => s.totalValue);
    const initial = values[0];
    const latest = values[values.length - 1];
  
    const roi = calculateROI(initial, latest);
    const volatility = calculateVolatility(values);
    const twr = calculateTimeWeightedReturn(values);
  
    // Example benchmark (BTC)
    const benchmark = {
      name: 'Bitcoin',
      roi: calculateROI(30000, 50000), // simulate BTC from $30k to $50k
    };
  
    return {
      userId,
      dataPoints: snapshots.map((s) => ({
        timestamp: s.createdAt,
        value: s.totalValue,
      })),
      metrics: {
        roi,
        volatility,
        timeWeightedReturn: twr,
      },
      benchmarkComparison: benchmark,
    };
  }
  
}
