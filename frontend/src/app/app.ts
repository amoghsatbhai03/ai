import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FarmerService, Farmer } from './farmer.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  farmers: Farmer[] = [];
  question = 'Which farmer has the highest pending payment?';
  answer = '';
  loading = false;
  error = '';

  private farmerService = inject(FarmerService);

  ngOnInit(): void {
    this.loadFarmers();
  }

  loadFarmers(): void {
    this.farmerService.getFarmers().subscribe({
      next: (data: Farmer[]) => {
        this.farmers = data;
        this.error = '';
      },
      error: (err: unknown) => {
        console.error('Failed to load farmers:', err);
        this.error = 'Could not load farmers. Check the backend.';
      }
    });
  }

  askQuestion(): void {
    if (!this.question.trim() || this.loading) {
      return;
    }

    this.loading = true;
    this.answer = '';
    this.error = '';

    this.farmerService.askAI(this.question).subscribe({
      next: (result: { answer: string }) => {
        this.answer = result.answer;
        this.loading = false;
      },
      error: (err: unknown) => {
        console.error('AI request failed:', err);
        this.error = 'AI request failed. Check your backend and API key.';
        this.loading = false;
      }
    });
  }

  get totalTons(): number {
    return this.farmers.reduce(
      (sum, farmer) => sum + Number(farmer.sugarcane_tons),
      0
    );
  }

  get totalPending(): number {
    return this.farmers.reduce(
      (sum, farmer) => sum + Number(farmer.payment_pending),
      0
    );
  }
}