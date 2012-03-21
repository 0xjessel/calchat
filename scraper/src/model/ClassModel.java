package model;

public class ClassModel {
	public String term;
	public String department;
	public String number;
	public String title;
	public String days;
	public String time;
	public String building;
	public String buildingNumber;

	@Override
	public String toString() {
		return String.format("ClassModel: %s %s (%s)", department, number,
				title);
	}

	public ClassModel(String term, String department, String number,
			String title, String days, String time, String building,
			String buildingNumber) {
		super();
		this.term = term;
		this.department = department;
		this.number = number;
		this.title = title;
		this.days = days;
		this.time = time;
		this.building = building;
		this.buildingNumber = buildingNumber;
	}
}
