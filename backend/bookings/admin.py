from django.contrib import admin
from .models import Booking, BookingChangeLog


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "resource", "booking_type", "time_format", "start_datetime", "end_datetime", "status")
    list_filter = ("booking_type", "time_format", "status")
    search_fields = ("user__username", "resource__name")


@admin.register(BookingChangeLog)
class BookingChangeLogAdmin(admin.ModelAdmin):
    list_display = ("id", "booking", "change_type", "created_at")
    list_filter = ("change_type",)
