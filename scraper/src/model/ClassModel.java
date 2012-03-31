package model;

import java.util.List;

public class ClassModel {
	public String term;
	public String department;
	public String number;
	public String title;
	public List<Schedule> schedules;

	@Override
	public String toString() {
		return String.format("ClassModel: %s %s (%s)", department, number,
				title);
	}

	public String getTerm() {
		return term;
	}

	public void setTerm(String term) {
		this.term = term;
	}

	public String getDepartment() {
		return department;
	}

	public void setDepartment(String department) {
		this.department = department;
	}

	public String getNumber() {
		return number;
	}

	public void setNumber(String number) {
		this.number = number;
	}

	public String getTitle() {
		return title;
	}

	public void setTitle(String title) {
		this.title = title;
	}

	public List<Schedule> getSchedules() {
		return schedules;
	}

	public void setSchedules(List<Schedule> schedules) {
		this.schedules = schedules;
	}

	public ClassModel(String term, String department, String number,
			String title, List<Schedule> schedules) {
		super();
		this.term = term;
		this.department = department;
		this.number = number;
		this.title = title;
		this.schedules = schedules;
	}

	static public class Schedule {
		public String days;
		public String time;
		public String building;
		public String buildingNumber;

		@Override
		public String toString() {
			return String.format("%s:%s:%s:%s", days, time, building,
					buildingNumber);
		}

		public String getDays() {
			return days;
		}

		public void setDays(String days) {
			this.days = days;
		}

		public String getTime() {
			return time;
		}

		public void setTime(String time) {
			this.time = time;
		}

		public String getBuilding() {
			return building;
		}

		public void setBuilding(String building) {
			this.building = building;
		}

		public String getBuildingNumber() {
			return buildingNumber;
		}

		public void setBuildingNumber(String buildingNumber) {
			this.buildingNumber = buildingNumber;
		}

		public Schedule(String days, String time, String building,
				String buildingNumber) {
			super();
			this.days = days;
			this.time = time;
			this.building = building;
			this.buildingNumber = buildingNumber;
		}
	}
}
