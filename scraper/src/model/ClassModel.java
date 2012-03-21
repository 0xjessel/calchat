package model;

public class ClassModel {
	private String department;
	private String number;
	private String title;
	private String time;
	private String location;

	public ClassModel(String department, String number, String title,
			String time, String location) {
		super();
		this.department = department;
		this.number = number;
		this.title = title;
		this.time = time;
		this.location = location;
	}

	@Override
	public String toString() {
		return String.format("ClassModel: %s %s (%s)", department, number,
				title);
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

	public String getTime() {
		return time;
	}

	public void setTime(String time) {
		this.time = time;
	}

	public String getLocation() {
		return location;
	}

	public void setLocation(String location) {
		this.location = location;
	}
}
